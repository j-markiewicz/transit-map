import { LineString } from "geojson";
import ms from "ms";
import { createHash } from "crypto";
import { Temporal } from "temporal-polyfill";

import {
	Alert,
	BasicSystemInfo,
	Lazy,
	Line,
	LinesInfo,
	RawGtfs,
	RawRealtime,
	Stop,
	StopSchedule,
	StopSchedules,
	SystemConfig,
	SystemInfo,
	TimeInterval,
	Vehicle,
	VehicleType,
	Weekday,
} from "./types.js";
import WorkerPool from "./workerpool.js";
import DB from "./db.js";

const gtfs_workers = new WorkerPool(
	new URL("./gtfs_worker.js", import.meta.url)
);
const realtime_workers = new WorkerPool(
	new URL("./rt_worker.js", import.meta.url)
);

export default class Data {
	private db: DB;
	private systems: { [name in string]?: SystemInfo };

	private constructor(
		db: DB,
		config: { [name in string]?: SystemConfig & { owner: string } }
	) {
		this.db = db;
		this.systems = Object.fromEntries(
			Object.entries(config).map(([k, v]): [string, SystemInfo | undefined] => [
				k,
				v === undefined
					? undefined
					: {
							...v,
							alerts: undefined,
							vehicles: undefined,
							stops: undefined,
							lines: undefined,
							stop_schedules: undefined,
							services: undefined,
					  },
			])
		);
	}

	public static async new(db: DB): Promise<Data> {
		return new Data(db, await db.get_config_all());
	}

	/** check if there is data/configuration for the given system */
	public has_system(system: string): boolean {
		return this.systems[system] !== undefined;
	}

	/** download and cache all gtfs schedule (non-realtime) data for all systems
	 *
	 * this process happens in the background, and only runs if not disabled with `--no-precache`
	 */
	public precache() {
		if (process.argv.includes("--no-precache")) {
			return;
		}

		for (const system of Object.keys(this.systems)) {
			for (const source of Object.keys(this.systems[system]?.gtfs ?? {})) {
				this.fetch_or_cached_gtfs(system, source);
			}
		}

		this.get_all_info();
	}

	/** get all systems' info */
	public get_all_info(): Promise<BasicSystemInfo[]> {
		return Promise.all(
			Object.keys(this.systems).map((system) => this.get_info(system))
		).then((res) => res.filter((info) => info !== undefined));
	}

	/** get the info for the given system */
	public get_info(system: string): Promise<BasicSystemInfo> | undefined {
		const sys = this.systems[system];

		if (sys === undefined) {
			return undefined;
		}

		const short_wait: Promise<undefined> = new Promise((res) =>
			setTimeout(res, 10)
		);

		return (async () => ({
			name: system,
			location: sys.location,
			gtfs_sources: Object.keys(sys.gtfs).length,
			rt_sources: Object.keys(sys.realtime).length,
			lines: await Promise.race([
				this.get_lines(system)?.then((l) => l.length),
				short_wait,
			]),
			stops: await Promise.race([
				this.get_stops(system)?.then((s) => s.length),
				short_wait,
			]),
		}))();
	}

	/** get the config for the given system */
	public get_config(
		system: string
	): (SystemConfig & { owner: string }) | undefined {
		const sys = this.systems[system];

		if (sys === undefined) {
			return undefined;
		}

		return {
			owner: sys.owner,
			location: sys.location,
			gtfs: Object.fromEntries(
				Object.entries(sys.gtfs).map(([s, g]) => [
					s,
					g === undefined
						? undefined
						: {
								id: g.id,
								max_age: g.max_age,
						  },
				])
			),
			realtime: Object.fromEntries(
				Object.entries(sys.realtime).map(([s, g]) => [
					s,
					g === undefined
						? undefined
						: {
								id: g.id,
								max_age: g.max_age,
						  },
				])
			),
		};
	}

	/** set the config for an existing system if it exists, returning whether the system existed */
	public set_config(
		system: string,
		config: SystemConfig
	): Promise<true> | false {
		const sys = this.systems[system];
		if (sys === undefined) {
			return false;
		}

		this.systems[system] = {
			...config,
			owner: sys.owner,
			alerts: undefined,
			vehicles: undefined,
			stops: undefined,
			lines: undefined,
			stop_schedules: undefined,
			services: undefined,
		};

		return this.db
			.set_config(system, config)
			.then(() => this.precache())
			.then(() => true);
	}

	/** add the config for a new system if it doesn't exists, returning whether the addition was successful */
	public add_config(
		system: string,
		owner: string,
		config: SystemConfig
	): Promise<true> | false {
		if (this.systems[system] !== undefined) {
			return false;
		}

		this.systems[system] = {
			...config,
			owner,
			alerts: undefined,
			vehicles: undefined,
			stops: undefined,
			lines: undefined,
			stop_schedules: undefined,
			services: undefined,
		};

		return this.db
			.add_config(system, owner, config)
			.then(() => this.precache())
			.then(() => true);
	}

	/** remove the config for an existing system if it exists, returning whether the system existed */
	public delete_config(system: string): Promise<true> | false {
		if (this.systems[system] === undefined) {
			return false;
		}

		delete this.systems[system];

		return this.db.delete_config(system).then(() => true);
	}

	/** get the alerts for the given system */
	public get_alerts(system: string): Promise<Alert[]> | undefined {
		const alerts = this.systems[system]?.alerts;

		if (alerts !== undefined) {
			return alerts;
		} else if (this.systems[system] === undefined) {
			return undefined;
		}

		this.systems[system].alerts = this.compute_alerts(system);
		return this.systems[system].alerts;
	}

	/** get the vehicles for the given system */
	public get_vehicles(system: string): Promise<Vehicle[]> | undefined {
		const vehicles = this.systems[system]?.vehicles;

		if (vehicles !== undefined) {
			return vehicles;
		} else if (this.systems[system] === undefined) {
			return undefined;
		}

		this.systems[system].vehicles = this.compute_vehicles(system);
		return this.systems[system]?.vehicles;
	}

	/** get the stops for the given system */
	public get_stops(system: string): Promise<Stop[]> | undefined {
		const stops = this.systems[system]?.stops;

		if (stops !== undefined) {
			return stops;
		} else if (this.systems[system] === undefined) {
			return undefined;
		}

		this.systems[system].stops = this.compute_stops(system);
		return this.systems[system]?.stops;
	}

	/** get the lines for the given system */
	public get_lines(system: string): Promise<Line[]> | undefined {
		const lines = this.systems[system]?.lines;

		if (lines !== undefined) {
			return lines.then((l) => l.lines);
		} else if (this.systems[system] === undefined) {
			return undefined;
		}

		this.systems[system].lines = this.compute_lines(system);
		return this.systems[system]?.lines?.then((l) => l.lines);
	}

	/** get the stop schedule for the given stop in the given system */
	public get_stop_schedule(
		system: string,
		stop: string
	): Promise<StopSchedule | undefined> | undefined {
		const stop_schedules = this.systems[system]?.stop_schedules;

		if (stop_schedules !== undefined) {
			return stop_schedules.then((s) => s[stop]?.get());
		} else if (this.systems[system] === undefined) {
			return undefined;
		}

		this.systems[system].stop_schedules = this.compute_stop_schedules(system);
		return this.systems[system]?.stop_schedules?.then((s) => s[stop]?.get());
	}

	/** get line information for the given line in the given system */
	public get_line(
		system: string,
		line: string
	): Promise<Line | undefined> | undefined {
		const lines = this.systems[system]?.lines;

		if (lines !== undefined) {
			return lines.then((l) => l.lines.find((l) => l.id === line));
		} else if (this.systems[system] === undefined) {
			return undefined;
		}

		this.systems[system].lines = this.compute_lines(system);
		return this.systems[system]?.lines?.then((l) =>
			l.lines.find((l) => l.id === line)
		);
	}

	/** get the given shape in the given system */
	public get_shape(
		system: string,
		shape: string
	): Promise<LineString | undefined> | undefined {
		const lines = this.systems[system]?.lines;

		if (lines !== undefined) {
			return lines.then((l) => l.shapes[shape]);
		} else if (this.systems[system] === undefined) {
			return undefined;
		}

		this.systems[system].lines = this.compute_lines(system);
		return this.systems[system].lines.then((l) => l.shapes[shape]);
	}

	/** get the mappings from trip id to line id and service id for the given system */
	private get_trip_mappings(
		system: string
	): Promise<LinesInfo["trip_mappings"]> {
		const lines = this.systems[system]?.lines;

		if (lines !== undefined) {
			return lines.then((l) => l.trip_mappings);
		} else if (this.systems[system] === undefined) {
			throw new Error(`transit system ${system} is undefined`);
		}

		this.systems[system].lines = this.compute_lines(system);
		return this.systems[system]?.lines?.then((l) => {
			if (l.trip_mappings === undefined) {
				throw new Error(
					`trip_mappings is undefined for transit system ${system}`
				);
			} else {
				return l.trip_mappings;
			}
		});
	}

	/** get the service dates for the given system */
	private get_services(
		system: string
	): Promise<{ [service in string]?: Temporal.ZonedDateTime[] }> {
		const services = this.systems[system]?.services;

		if (services !== undefined) {
			return services;
		} else if (this.systems[system] === undefined) {
			throw new Error(`transit system ${system} is undefined`);
		}

		this.systems[system].services = this.compute_services(system);
		return this.systems[system]?.services;
	}

	/** compute alerts for the given system */
	private async compute_alerts(system: string): Promise<Alert[]> {
		console.debug(`computing alerts for ${system}`);

		if (this.systems[system] === undefined) {
			throw new Error(`Transit system ${system} not found`);
		}

		const rt_alerts = (
			await Promise.all(
				Object.keys(this.systems[system].realtime).map((rt) =>
					this.fetch_or_cached_realtime(system, rt)
				)
			)
		)
			.map((rt) => rt.alerts)
			.filter((alerts) => alerts !== undefined)
			.flat(1);

		return rt_alerts.map((alert) => ({
			info: alert.info,
			details: alert.details,
			time:
				alert.start === undefined && alert.end === undefined
					? undefined
					: ([alert.start ?? null, alert.end ?? null] as TimeInterval),
		}));
	}

	/** compute vehicles for the given system */
	private async compute_vehicles(system: string): Promise<Vehicle[]> {
		console.debug(`computing vehicles for ${system}`);

		if (this.systems[system] === undefined) {
			throw new Error(`Transit system ${system} not found`);
		}

		const rt = await Promise.all(
			Object.keys(this.systems[system].realtime).map((rt) =>
				this.fetch_or_cached_realtime(system, rt)
			)
		);

		const rt_vehicles = rt
			.map((rt) => rt.positions)
			.filter((vehicles) => vehicles !== undefined)
			.flat(1);

		const [trip_mappings, lines_arr] = await Promise.all([
			this.get_trip_mappings(system),
			this.get_lines(system),
		]);

		const rt_updates: {
			[line in string]?: Map<
				number | string,
				{
					arrival?: {
						delay?: number;
						time?: number;
						uncertainty?: number;
					};
					departure?: {
						delay?: number;
						time?: number;
						uncertainty?: number;
					};
				}
			>;
		} = Object.fromEntries(
			rt
				.map((rt) => rt.trip_updates)
				.filter((upd) => upd !== undefined)
				.flatMap((upd) =>
					upd
						.filter((u) => u.trip.trip !== undefined)
						.map((u) => ({ ...u, line: trip_mappings[u.trip.trip!]?.line }))
						.filter((u) => u.line !== undefined)
						.map((u) => [u.line, new Map(u.updates.map((u) => [u.stop, u]))])
				)
		);

		const lines: { [line in string]?: Line } = Object.fromEntries(
			lines_arr?.map((l) => [l.id, l]) ?? []
		);

		return rt_vehicles.map((vehicle) => {
			const line = line_id(vehicle.trip, trip_mappings);

			const update =
				vehicle.stop === undefined
					? undefined
					: rt_updates[line]?.get(vehicle.stop);
			const delay = update?.departure?.delay ?? update?.departure?.delay;
			const uncertainty =
				update?.departure?.uncertainty ?? update?.departure?.uncertainty;

			return {
				id: vehicle.id,
				name: vehicle.name,
				type: lines[line]?.type ?? VehicleType.Other,
				ts: vehicle.ts,
				lat: vehicle.lat,
				lon: vehicle.lon,
				hdg: vehicle.hdg,
				line,
				line_name: lines[line]?.name ?? "???",
				headsign: lines[line]?.headsign ?? "",
				delay: delay !== undefined ? [delay, uncertainty] : undefined,
			};
		});
	}

	/** compute stops for the given system */
	private async compute_stops(system: string): Promise<Stop[]> {
		console.debug(`computing stops for ${system}`);

		if (this.systems[system] === undefined) {
			throw new Error(`Transit system ${system} not found`);
		}

		const gtfs = await Promise.all(
			Object.keys(this.systems[system].gtfs).map((gtfs) =>
				this.fetch_or_cached_gtfs(system, gtfs)
			)
		);

		const [trip_mappings, lines_arr] = await Promise.all([
			this.get_trip_mappings(system),
			this.get_lines(system),
		]);

		const lines: { [line in string]?: Line } = Object.fromEntries(
			lines_arr?.map((l) => [l.id, l]) ?? []
		);

		const gtfs_stops = gtfs.flatMap((data) => data.stops);
		const stop_lines: { [stop in string]?: Stop["lines"] } = {};
		const stop_types: {
			[stop in string]?: Map<VehicleType, number>;
		} = {};

		gtfs
			.flatMap((data) => data.stop_times)
			.forEach((st) => {
				const lid = trip_mappings[st.trip]?.line ?? "???";
				const line = lines[lid];

				if (stop_lines[st.stop] === undefined) {
					stop_lines[st.stop] = {};
				}

				stop_lines[st.stop]![lid] = {
					name: line?.name ?? "???",
					headsign: line?.headsign ?? "",
					type: line?.type ?? VehicleType.Other,
				};

				if (line === undefined) {
					return;
				}

				if (stop_types[st.stop] === undefined) {
					stop_types[st.stop] = new Map();
				}

				if (stop_types[st.stop]!.has(line.type)) {
					stop_types[st.stop]!.set(line.type, 0);
				} else {
					stop_types[st.stop]!.set(
						line.type,
						stop_types[st.stop]!.get(line.type)! + 1
					);
				}
			});

		return gtfs_stops.map((stop) => ({
			id: stop.id,
			name: stop.name,
			types: [...new Set(stop_types[stop.id]?.keys() ?? [])].sort(
				(a, b) =>
					(stop_types[stop.id]?.get(b) ?? 0) -
					(stop_types[stop.id]?.get(a) ?? 0)
			),
			lat: isNaN(stop.lat) ? Math.random() : stop.lat,
			lon: isNaN(stop.lon) ? Math.random() : stop.lon,
			lines: stop_lines[stop.id] ?? {},
		}));
	}

	/** compute lines for the given system */
	private async compute_lines(system: string): Promise<LinesInfo> {
		console.debug(`computing lines for ${system}`);

		if (this.systems[system] === undefined) {
			throw new Error(`Transit system ${system} not found`);
		}

		const gtfs = await Promise.all(
			Object.keys(this.systems[system].gtfs).map((gtfs) =>
				this.fetch_or_cached_gtfs(system, gtfs)
			)
		);

		const gtfs_trips = gtfs.flatMap((data) => data.trips);
		const gtfs_routes = Object.fromEntries(
			gtfs.flatMap((data) => data.routes).map((r) => [r.id, r])
		);

		const gtfs_stop_times: { [key in string]?: RawGtfs["stop_times"] } = {};
		for (const st of gtfs.flatMap((data) => data.stop_times)) {
			if (gtfs_stop_times[st.trip] !== undefined) {
				gtfs_stop_times[st.trip]?.push(st);
			} else {
				gtfs_stop_times[st.trip] = [st];
			}
		}

		const gtfs_stops: { [stop in string]?: Line["stops"][number] } =
			Object.fromEntries(
				gtfs
					.flatMap((data) => data.stops)
					.map((s) => [
						s.id,
						{ id: s.id, name: s.name, lat: s.lat, lon: s.lon },
					])
			);

		const shapes: {
			[shape in string]?: {
				id: string;
				lat: number;
				lon: number;
				sequence: number;
			}[];
		} = {};

		gtfs
			.flatMap((data) => data.shapes ?? [])
			.forEach((s) => {
				if (shapes[s.id] !== undefined) {
					shapes[s.id]?.push(s);
				} else {
					shapes[s.id] = [s];
				}
			});

		Object.values(shapes).forEach((s) =>
			s?.sort((a, b) => a.sequence - b.sequence)
		);

		const lines = new Map<string, Line>();

		const trip_desc = (trip: {
			name: string;
			headsign: string;
			stops: string[];
		}) =>
			`${trip.name.trim()} (${trip.headsign.trim()}) via ${trip.stops
				.map((s) => s.trim())
				.join(", ")}`;

		const trip_mappings: LinesInfo["trip_mappings"] = {};

		for (const gtfs_trip of gtfs_trips) {
			let shape: (LineString & { id: string }) | undefined = undefined;
			const shape_points =
				gtfs_trip.shape !== undefined ? shapes[gtfs_trip.shape] ?? [] : [];

			if (shape_points.length > 0) {
				shape = {
					type: "LineString",
					id: gtfs_trip.shape!,
					coordinates: shape_points.map((p) => [p.lon, p.lat]),
				};
			}

			const stops =
				gtfs_stop_times[gtfs_trip.id]
					?.sort((a, b) => a.sequence - b.sequence)
					?.map((st) => st.stop) ?? [];

			const headsign =
				gtfs_trip.headsign ||
				`${gtfs_stops[stops[0]]?.name ?? "?"} - ${
					gtfs_stops[stops[stops.length - 1]]?.name ?? "?"
				}`;

			const trip = {
				id: gtfs_trip.id,
				name: gtfs_routes[gtfs_trip.route]?.name ?? "???",
				color: gtfs_routes[gtfs_trip.route]?.color,
				headsign,
				type: gtfs_routes[gtfs_trip.route]?.type ?? VehicleType.Other,
				stops,
				shape: shape !== undefined ? [shape.id] : [],
			};

			const desc = trip_desc(trip);
			const line = lines.get(desc);

			if (line !== undefined) {
				trip_mappings[trip.id] = { line: line.id, service: gtfs_trip.service };

				if (shape !== undefined) {
					line.shape?.push(shape.id);
				}
			} else {
				const id = `${trip.name}-${short_hash(desc)}`;
				trip_mappings[trip.id] = { line: id, service: gtfs_trip.service };
				lines.set(desc, {
					...trip,
					id,
					stops: trip.stops
						.map((s) => gtfs_stops[s])
						.filter((s) => s !== undefined),
				});
			}
		}

		return {
			lines: [...lines.values()].map((l) => ({
				...l,
				shape: [...new Set(l.shape?.filter((s) => s !== undefined))],
			})),
			trip_mappings,
			shapes: Object.fromEntries(
				Object.entries(shapes)
					.filter(([_, v]) => v !== undefined)
					.map(([k, v]) => [
						k,
						{
							type: "LineString",
							coordinates: v!.map(({ lat, lon }) => [lon, lat]),
						},
					])
			),
		};
	}

	/** compute stop schedules for the given system */
	private async compute_stop_schedules(system: string): Promise<StopSchedules> {
		console.debug(`computing stop schedules for ${system}`);

		if (this.systems[system] === undefined) {
			throw new Error(`Transit system ${system} not found`);
		}

		const gtfs = await Promise.all(
			Object.keys(this.systems[system].gtfs).map((gtfs) =>
				this.fetch_or_cached_gtfs(system, gtfs)
			)
		);

		const gtfs_stop_times: { [stop in string]?: RawGtfs["stop_times"] } = {};
		for (const st of gtfs.flatMap((data) => data.stop_times)) {
			if (gtfs_stop_times[st.stop] !== undefined) {
				gtfs_stop_times[st.stop]?.push(st);
			} else {
				gtfs_stop_times[st.stop] = [st];
			}
		}

		const gtfs_calendar = gtfs.flatMap((gtfs) => gtfs.calendar);
		const gtfs_calendar_dates = gtfs.flatMap((gtfs) => gtfs.calendar_dates);

		const calendar = Object.fromEntries(gtfs_calendar.map((c) => [c?.id, c]));

		const [trip_mappings, services, stops_arr] = await Promise.all([
			this.get_trip_mappings(system),
			this.get_services(system),
			this.get_stops(system),
		]);

		const stops: { [stop in string]?: Stop } = Object.fromEntries(
			stops_arr?.map((s) => [s.id, s]) ?? []
		);

		const rt = await Promise.all(
			Object.entries(this.systems[system].realtime)
				.filter(([_, rt]) => rt?.id !== undefined)
				.map(([rt, _]) => this.fetch_or_cached_realtime(system, rt))
		);

		const rt_updates: {
			[line in string]?: {
				vehicle?: string;
				updates: {
					stop: number | string;
					arrival?: {
						delay?: number;
						time?: number;
						uncertainty?: number;
					};
					departure?: {
						delay?: number;
						time?: number;
						uncertainty?: number;
					};
				}[];
			};
		} = Object.fromEntries(
			rt
				.map((rt) => rt.trip_updates)
				.filter((upd) => upd !== undefined)
				.flatMap((upd) =>
					upd
						.filter((u) => u.trip.trip !== undefined)
						.map((u) => ({ ...u, line: trip_mappings[u.trip.trip!]?.line }))
						.filter((u) => u.line !== undefined)
						.map((u) => [u.line, u])
				)
		);

		const stop_schedules: {
			[stop in string]?: Lazy<StopSchedule>;
		} = {};

		const noon = Temporal.PlainTime.from("12:00:00");
		for (const [stop, st] of Object.entries(gtfs_stop_times)) {
			stop_schedules[stop] = new Lazy(() => {
				const schedule_init: {
					[line in string]?: [Temporal.PlainTime, string][][];
				} = {};

				for (const s of st ?? []) {
					const times_raw = [time(s.arrival), time(s.departure)];

					if (times_raw.some((t) => t === undefined)) {
						continue;
					}

					const line = trip_mappings[s.trip];

					if (line === undefined) {
						continue;
					}

					const cal = calendar[line.service];

					if (cal === undefined) {
						continue;
					}

					const times = [noon.add(times_raw[0]!), noon.add(times_raw[1]!)];
					const extra_days = [
						Math.floor(times_raw[0]!.add({ hours: 12 }).total("days")),
						Math.floor(times_raw[1]!.add({ hours: 12 }).total("days")),
					];
					const diff_days = extra_days[1] - extra_days[0];

					const add_day = (day_base: number) => {
						const day = (day_base + extra_days[0]) % 7;

						if (schedule_init[line.line] === undefined) {
							schedule_init[line.line] = [[], [], [], [], [], [], []];
						}

						schedule_init[line.line]![day].push([
							times[0],
							diff_days === 0
								? times[1].toString()
								: `${times[1].toString()} +${diff_days}`,
						]);
					};

					if (cal.monday) add_day(0);
					if (cal.tuesday) add_day(1);
					if (cal.wednesday) add_day(2);
					if (cal.thursday) add_day(3);
					if (cal.friday) add_day(4);
					if (cal.saturday) add_day(5);
					if (cal.sunday) add_day(6);
				}

				for (const line of Object.values(schedule_init).filter(
					(l) => l !== undefined
				)) {
					for (const day of line) {
						day.sort((a, b) => a[0].since(b[0]).total("seconds"));
					}
				}

				const schedule: {
					[line in string]?: {
						[day in Weekday]: [string, string][];
					};
				} = Object.fromEntries(
					Object.entries(schedule_init).map(([k, line]) => [
						k,
						{
							monday: line?.[0]?.map(([a, d]) => [a.toString(), d])!,
							tuesday: line?.[1]?.map(([a, d]) => [a.toString(), d])!,
							wednesday: line?.[2]?.map(([a, d]) => [a.toString(), d])!,
							thursday: line?.[3]?.map(([a, d]) => [a.toString(), d])!,
							friday: line?.[4]?.map(([a, d]) => [a.toString(), d])!,
							saturday: line?.[5]?.map(([a, d]) => [a.toString(), d])!,
							sunday: line?.[6]?.map(([a, d]) => [a.toString(), d])!,
						},
					])
				);

				const services_at_this_stop = [
					...new Set(st?.map((st) => trip_mappings[st.trip]?.service)),
				].filter((s) => s !== undefined);

				const arrivals = (st ?? []).flatMap((st) => {
					const lid = line_id(st.trip, trip_mappings);

					const arrival_time = time(st.arrival);
					const departure_time = time(st.departure);
					const some_time = departure_time ?? arrival_time;

					if (some_time === undefined) {
						return [];
					}

					const start = Temporal.Now.zonedDateTimeISO("Etc/UTC")
						.subtract({ days: 2 })
						.subtract(some_time.round("days"));

					const end = Temporal.Now.zonedDateTimeISO("Etc/UTC").add({
						days: 8,
					});

					const is_in_range = (dt: Temporal.ZonedDateTime): boolean =>
						start.since(dt).sign === -1 && end.since(dt).sign === 1;

					if (trip_mappings[st.trip] === undefined) {
						return [];
					}

					return (
						services[trip_mappings[st.trip]!.service]
							?.filter(is_in_range)
							?.flatMap((date) => {
								const arrival = date.add(
									arrival_time === undefined ? some_time : arrival_time
								);

								const departure = date.add(
									departure_time === undefined ? some_time : departure_time
								);

								const diff = (
									dt: number | undefined,
									st: Temporal.Duration | undefined
								) => {
									if (dt === undefined || st == undefined) {
										return undefined;
									}

									return date
										.add(st)
										.toInstant()
										.since(Temporal.Instant.fromEpochSeconds(dt)).seconds;
								};

								const upd = rt_updates[lid]?.updates?.find(
									(u) => u.stop === st.sequence || u.stop === st.stop
								);

								const delay =
									upd?.departure?.delay ??
									diff(upd?.departure?.time, departure_time) ??
									upd?.arrival?.delay ??
									diff(upd?.arrival?.time, arrival_time) ??
									diff(upd?.departure?.time, some_time) ??
									diff(upd?.arrival?.time, some_time);

								const uncertainty =
									upd?.departure?.uncertainty ?? upd?.arrival?.uncertainty;

								return {
									line: lid,
									arrival,
									departure,
									vehicle: rt_updates[lid]?.vehicle,
									delay:
										delay !== undefined
											? ([delay, uncertainty] as [number, number | undefined])
											: undefined,
								};
							}) ?? []
					);
				});

				return {
					...(stops[stop] ?? {
						id: stop,
						name: "???",
						types: [],
						lat: 0,
						lon: 0,
						lines: {},
					}),
					schedule: {
						additional: gtfs_calendar_dates
							.filter((d) => d?.type === "added")
							.filter((d) => services_at_this_stop.includes(d!.id))
							.map((d) => date(d!.date))
							.sort((a, b) => a.since(b).total("days"))
							.map((d) => d.toString()),
						removed: gtfs_calendar_dates
							.filter((d) => d?.type === "removed")
							.filter((d) => services_at_this_stop.includes(d!.id))
							.map((d) => date(d!.date))
							.sort((a, b) => a.since(b).total("days"))
							.map((d) => d.toString()),
						schedule,
					},
					arrivals: arrivals
						.sort((a, b) => a.arrival.since(b.arrival).sign)
						.map((s) => ({
							...s,
							arrival: s.arrival.toString(),
							departure: s.departure.toString(),
						})),
				};
			});
		}

		return stop_schedules;
	}

	/** compute services for the given system */
	private async compute_services(
		system: string
	): Promise<{ [service in string]?: Temporal.ZonedDateTime[] }> {
		console.debug(`computing services for ${system}`);

		if (this.systems[system] === undefined) {
			throw new Error(`Transit system ${system} not found`);
		}

		const gtfs = await Promise.all(
			Object.keys(this.systems[system].gtfs).map((gtfs) =>
				this.fetch_or_cached_gtfs(system, gtfs)
			)
		);

		const calendar = gtfs.flatMap(
			(data) =>
				data.calendar?.map((cal) => ({ ...cal, tz: data.timezone })) ?? []
		);

		const dates = gtfs.flatMap(
			(data) =>
				data.calendar_dates?.map((dat) => ({ ...dat, tz: data.timezone })) ?? []
		);

		const services: { [service in string]?: Temporal.ZonedDateTime[] } = {};

		for (const cal of calendar) {
			const start_date = date(cal.start_date);
			const end_date = date(cal.end_date);

			if (end_date.since(start_date).sign === -1) {
				throw new Error(
					`service ${cal.id}'s end date is before its start date`
				);
			}

			const dates = [];
			let current_date = start_date;
			while (current_date.since(end_date).sign === -1) {
				switch (current_date.dayOfWeek) {
					case 1:
						if (cal.monday) dates.push(current_date);
						break;
					case 2:
						if (cal.tuesday) dates.push(current_date);
						break;
					case 3:
						if (cal.wednesday) dates.push(current_date);
						break;
					case 4:
						if (cal.thursday) dates.push(current_date);
						break;
					case 5:
						if (cal.friday) dates.push(current_date);
						break;
					case 6:
						if (cal.saturday) dates.push(current_date);
						break;
					case 7:
						if (cal.sunday) dates.push(current_date);
						break;
				}

				current_date = current_date.add(Temporal.Duration.from({ days: 1 }));
			}

			services[cal.id] = dates.map((d) =>
				d.toZonedDateTime({
					timeZone: cal.tz,
					plainTime: "T12:00:00",
				})
			);
		}

		for (const dat of dates) {
			if (dat.type === "removed") {
				services[dat.id] = services[dat.id]?.filter(
					(d) => !d.toPlainDate().equals(date(dat.date))
				);
			} else {
				if (services[dat.id] === undefined) {
					services[dat.id] = [
						date(dat.date).toZonedDateTime({
							timeZone: dat.tz,
							plainTime: "T12:00:00",
						}),
					];
				} else {
					services[dat.id]?.push(
						date(dat.date).toZonedDateTime({
							timeZone: dat.tz,
							plainTime: "T12:00:00",
						})
					);
				}
			}
		}

		return Object.fromEntries(
			Object.entries(services).map(([k, v]) => [
				k,
				[...new Set(v?.map((dt) => dt.toString()))].map((s) =>
					Temporal.ZonedDateTime.from(s)
				),
			])
		);
	}

	/** get cached gtfs data if available, otherwise fetch it from source */
	private fetch_or_cached_gtfs(
		system: string,
		source: string
	): Promise<RawGtfs> {
		const raw = this.systems[system]?.gtfs?.[source];

		if (raw === undefined) {
			throw new Error(
				`No configuration for GTFS source for ${system} from ${source}`
			);
		}

		if (raw.data !== undefined) {
			console.debug(`using cached GTFS from ${source}`);
			return raw.data;
		}

		const invalidate = () => {
			raw.data = undefined;

			if (this.systems[system] !== undefined) {
				this.systems[system].vehicles = undefined;
				this.systems[system].lines = undefined;
				this.systems[system].stop_schedules = undefined;
				this.systems[system].services = undefined;
				this.systems[system].stops = undefined;
			}
		};

		const data = (async () => {
			const schedule_invalidation = () => {
				setTimeout(() => {
					if (!process.argv.includes("--no-refetch")) {
						console.debug(
							`Auto-refetching GTFS data for ${system} from ${source} (use \`--no-refetch\` to disable)`
						);

						this.fetch_or_cached_gtfs(system, source).catch((err) => {
							console.warn(`Error refetching GTFS data: ${err}`);
							invalidate();
						});
					} else {
						console.debug(
							`GTFS data for ${system} from ${source} expired (remove \`--no-refetch\` to automatically refetch data)`
						);

						invalidate();
					}
				}, ms(raw.max_age));
			};

			try {
				return gtfs_workers.run({ source, id_prefix: raw.id }).then((res) => {
					schedule_invalidation();
					return res;
				}) as Promise<RawGtfs>;
			} catch (e) {
				console.warn(`Error getting GTFS data: ${e}, retrying`);
				await new Promise((resolve) => setTimeout(resolve, 1000));

				return gtfs_workers.run({ source, id_prefix: raw.id }).then((res) => {
					schedule_invalidation();
					return res;
				}) as Promise<RawGtfs>;
			}
		})();

		raw.data = data.catch((err) => {
			invalidate();
			throw err;
		});

		return raw.data;
	}

	/** get cached gtfs-rt data if available, otherwise fetch it from source */
	private fetch_or_cached_realtime(
		system: string,
		source: string
	): Promise<RawRealtime> {
		const raw = this.systems[system]?.realtime?.[source];

		if (raw === undefined) {
			throw new Error(
				`No configuration for GTFS-RT source for ${system} from ${source}`
			);
		}

		if (raw.data !== undefined) {
			console.debug(`using cached GTFS-RT from ${source}`);
			return raw.data;
		}

		const invalidate = () => {
			raw.data = undefined;

			if (this.systems[system] !== undefined) {
				this.systems[system].alerts = undefined;
				this.systems[system].vehicles = undefined;
				this.systems[system].stop_schedules = undefined;
			}
		};

		const data = (async () => {
			const schedule_invalidation = () =>
				setTimeout(invalidate, ms(raw.max_age));

			try {
				return realtime_workers
					.run({ source, id_prefix: raw.id })
					.then((res) => {
						schedule_invalidation();
						return res;
					}) as Promise<RawRealtime>;
			} catch (e) {
				console.warn(`Error getting GTFS-RT data: ${e}, retrying`);
				await new Promise((resolve) => setTimeout(resolve, 1000));

				return realtime_workers
					.run({ source, id_prefix: raw.id })
					.then((res) => {
						schedule_invalidation();
						return res;
					}) as Promise<RawRealtime>;
			}
		})();

		raw.data = data.catch((err) => {
			invalidate();
			throw err;
		});

		return raw.data;
	}
}

/** parse a date from `yyyymmdd` format */
function date(yyyymmdd: string): Temporal.PlainDate {
	const year = parseInt(yyyymmdd.substring(0, 4));
	const month = parseInt(yyyymmdd.substring(4, 6));
	const day = parseInt(yyyymmdd.substring(6, 8));

	return Temporal.PlainDate.from({ year, month, day });
}

/** parse a time as a duration "from noon - 12 hours" from `hh:mm:ss` format */
function time(hhmmss: string | undefined): Temporal.Duration | undefined {
	if (hhmmss === undefined) {
		return undefined;
	}

	const [hours, minutes, seconds] = hhmmss
		.split(":")
		.map((n) => parseInt(n, 10));

	return Temporal.Duration.from({ hours: -12 }).add(
		Temporal.Duration.from({ hours: hours, minutes, seconds })
	);
}

/** get a line id from a trip id using the given trip mappings */
function line_id(
	trip_id: string | undefined,
	trip_mappings: { [trip in string]?: { line: string } }
): string {
	if (trip_id) {
		return trip_mappings[trip_id]?.line ?? `???-${trip_id}`;
	}

	return "???";
}

/** get a short hash of the given string */
function short_hash(str: string): string {
	const LENGTH = 16;

	return createHash("sha256")
		.update(str)
		.digest("base64url")
		.substring(0, LENGTH);
}
