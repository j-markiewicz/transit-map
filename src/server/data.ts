import { LineString } from "geojson";
import ms from "ms";
import { createHash } from "crypto";
import { Worker } from "worker_threads";

import {
	VehicleType,
	TimeInterval,
	RawGtfs,
	RawRealtime,
	Alert,
	Stop,
	Vehicle,
	Line,
	LinesInfo,
	StopSchedule,
	StopSchedules,
	LineSchedule,
	LineSchedules,
	SystemConfig,
	SystemInfo,
} from "./types.js";

const gtfs_worker = new Worker(new URL("./gtfs_worker.js", import.meta.url));
const realtime_worker = new Worker(new URL("./rt_worker.js", import.meta.url));

export default class Data {
	constructor(config: { [name in string]?: SystemConfig }) {
		this.systems = {
			...config,
			alerts: undefined,
			vehicles: undefined,
			stops: undefined,
			lines: undefined,
			stop_schedules: undefined,
			line_schedules: undefined,
		};
	}

	private systems: { [name in string]?: SystemInfo };

	public has_system(system: string): boolean {
		return this.systems[system] !== undefined;
	}

	/** download and cache all gtfs schedule (non-realtime) data for all systems */
	public precache() {
		for (const system of Object.keys(this.systems)) {
			for (const source of Object.keys(this.systems[system]?.raw_gtfs ?? {})) {
				this.fetch_or_cached_gtfs(system, source);
			}
		}
	}

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

	public get_stop_schedule(
		system: string,
		stop: string
	): Promise<StopSchedule[] | undefined> | undefined {
		const stop_schedules = this.systems[system]?.stop_schedules;

		if (stop_schedules !== undefined) {
			return stop_schedules.then((s) => s[stop]);
		} else if (this.systems[system] === undefined) {
			return undefined;
		}

		this.systems[system].stop_schedules = this.compute_stop_schedules(system);
		return this.systems[system]?.stop_schedules?.then((s) => s[stop]);
	}

	public get_line_schedule(
		system: string,
		line: string
	): Promise<LineSchedule[] | undefined> | undefined {
		const line_schedules = this.systems[system]?.line_schedules;

		if (line_schedules !== undefined) {
			return line_schedules.then((s) => s[line]);
		} else if (this.systems[system] === undefined) {
			return undefined;
		}

		this.systems[system].line_schedules = this.compute_line_schedules(system);
		return this.systems[system]?.line_schedules?.then((s) => s[line]);
	}

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

	private get_trip_mappings(
		system: string
	): Promise<{ [key in string]?: string }> {
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

	private async compute_alerts(system: string): Promise<Alert[]> {
		console.debug(`computing alerts for ${system}`);

		if (this.systems[system] === undefined) {
			throw new Error(`Transit system ${system} not found`);
		}

		const rt_alerts = (
			await Promise.all(
				Object.keys(this.systems[system].raw_realtime).map((rt) =>
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
					: ([alert.start, alert.end] as TimeInterval),
		}));
	}

	private async compute_vehicles(system: string): Promise<Vehicle[]> {
		console.debug(`computing vehicles for ${system}`);

		if (this.systems[system] === undefined) {
			throw new Error(`Transit system ${system} not found`);
		}

		const gtfs = await Promise.all(
			Object.keys(this.systems[system].raw_gtfs).map((gtfs) =>
				this.fetch_or_cached_gtfs(system, gtfs)
			)
		);

		const gtfs_route_types = Object.fromEntries(
			gtfs.map((gtfs) => gtfs.routes.map((r) => [r.id, r.type]))
		);

		const gtfs_trip_types = Object.fromEntries(
			gtfs.map((gtfs) =>
				gtfs.trips.map((t) => [t.id, gtfs_route_types[t.route]])
			)
		);

		const rt = await Promise.all(
			Object.keys(this.systems[system].raw_realtime).map((rt) =>
				this.fetch_or_cached_realtime(system, rt)
			)
		);

		const rt_vehicles = rt
			.map((rt) => rt.positions)
			.filter((vehicles) => vehicles !== undefined)
			.flat(1);

		const rt_delays = Object.fromEntries(
			rt
				.map((rt) => rt.trip_updates)
				.filter((upd) => upd !== undefined)
				.flatMap((upd) =>
					upd
						.filter((u) => u.vehicle !== undefined)
						.map((u) => [u.vehicle, u.delay])
				)
		);

		const [trip_mappings, lines_arr] = await Promise.all([
			this.get_trip_mappings(system),
			this.get_lines(system),
		]);

		const lines: { [line in string]?: Line } = Object.fromEntries(
			lines_arr?.map((l) => [l.id, l]) ?? []
		);

		return rt_vehicles.map((vehicle) => {
			const line = line_id(vehicle.trip, trip_mappings);

			return {
				id: vehicle.id,
				name: vehicle.name,
				type: gtfs_trip_types[vehicle.trip ?? ""],
				ts: vehicle.ts,
				lat: vehicle.lat,
				lon: vehicle.lon,
				hdg: vehicle.hdg ?? 0,
				line,
				line_name: lines[line]?.name ?? "???",
				headsign: lines[line]?.headsign ?? "",
				delay: rt_delays[vehicle.id],
			};
		});
	}

	private async compute_stops(system: string): Promise<Stop[]> {
		console.debug(`computing stops for ${system}`);

		if (this.systems[system] === undefined) {
			throw new Error(`Transit system ${system} not found`);
		}

		const gtfs = await Promise.all(
			Object.keys(this.systems[system].raw_gtfs).map((gtfs) =>
				this.fetch_or_cached_gtfs(system, gtfs)
			)
		);

		const trip_mappings = await this.get_trip_mappings(system);

		const trips = Object.fromEntries(
			gtfs
				.flatMap((data) => data.trips)
				.map(({ id, route, headsign }) => [
					trip_mappings[id],
					{ route, headsign },
				])
		);

		const routes = Object.fromEntries(
			gtfs.flatMap((data) => data.routes).map(({ id, name }) => [id, name])
		);

		const gtfs_stops = gtfs.flatMap((data) => data.stops);
		const lines: { [key in string]?: Stop["lines"] } = {};

		gtfs
			.flatMap((data) => data.stop_times)
			.forEach((st) => {
				const line = trip_mappings[st.trip] ?? "???";

				if (lines[st.stop] === undefined) {
					lines[st.stop] = [
						{
							id: line,
							headsign: trips[line].headsign,
							name: routes[trips[line].route],
						},
					];
				} else if (lines[st.stop]?.every((s) => s.id !== line)) {
					lines[st.stop]?.push({
						id: line,
						headsign: trips[line].headsign,
						name: routes[trips[line].route],
					});
				}
			});

		return gtfs_stops.map((stop) => ({
			id: stop.id,
			name: stop.name,
			lat: stop.lat,
			lon: stop.lon,
			lines: lines[stop.id] ?? [],
		}));
	}

	private async compute_lines(system: string): Promise<LinesInfo> {
		console.debug(`computing lines for ${system}`);

		if (this.systems[system] === undefined) {
			throw new Error(`Transit system ${system} not found`);
		}

		const gtfs = await Promise.all(
			Object.keys(this.systems[system].raw_gtfs).map((gtfs) =>
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

		const trip_mappings: { [trip in string]?: string } = {};

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

			const trip = {
				id: gtfs_trip.id,
				name: gtfs_routes[gtfs_trip.route]?.name ?? "???",
				headsign: gtfs_trip.headsign,
				type: gtfs_routes[gtfs_trip.route]?.type ?? VehicleType.Other,
				stops:
					gtfs_stop_times[gtfs_trip.id]
						?.sort((a, b) => a.sequence - b.sequence)
						?.map((st) => st.stop) ?? [],
				shape: shape !== undefined ? [shape.id] : [],
			};

			const desc = trip_desc(trip);
			const line = lines.get(desc);

			if (line !== undefined) {
				trip_mappings[trip.id] = line.id;

				if (shape !== undefined) {
					line.shape?.push(shape.id);
				}
			} else {
				const id = `${trip.name}-${short_hash(desc)}`;
				trip_mappings[trip.id] = id;
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
			lines: [...lines.values()]
				.map((l) => ({
					...l,
					shape: [...new Set(l.shape?.filter((s) => s !== undefined))],
				}))
				.map((l) => ({
					...l,
					shape: l.shape.length === 0 ? undefined : l.shape,
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

	private async compute_stop_schedules(system: string): Promise<StopSchedules> {
		console.debug(`computing stop schedules for ${system}`);

		if (this.systems[system] === undefined) {
			throw new Error(`Transit system ${system} not found`);
		}

		const gtfs = await Promise.all(
			Object.keys(this.systems[system].raw_gtfs).map((gtfs) =>
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

		const [trip_mappings, lines_arr] = await Promise.all([
			this.get_trip_mappings(system),
			this.get_lines(system),
		]);

		const lines: { [line in string]?: Line } = Object.fromEntries(
			lines_arr?.map((l) => [l.id, l]) ?? []
		);

		const rt = await Promise.all(
			Object.entries(this.systems[system].raw_realtime)
				.filter(([_, rt]) => rt?.id !== undefined)
				.map(([rt, _]) => this.fetch_or_cached_realtime(system, rt))
		);

		const rt_updates: {
			[line in string]?: { vehicle?: string; delay?: number };
		} = Object.fromEntries(
			rt
				.map((rt) => rt.trip_updates)
				.filter((upd) => upd !== undefined)
				.flatMap((upd) =>
					upd
						.filter((u) => u.trip.trip !== undefined)
						.map((u) => ({ ...u, line: trip_mappings[u.trip.trip!] }))
						.filter((u) => u.line !== undefined)
						.map((u) => [u.line, { vehicle: u.vehicle, delay: u.delay }])
				)
		);

		const stop_schedules: {
			[stop in string]?: RawGtfs["stop_times"] | StopSchedule[];
		} = gtfs_stop_times;

		for (const [stop, st] of Object.entries(stop_schedules)) {
			stop_schedules[stop] = (st as RawGtfs["stop_times"]).map(
				(st): StopSchedule => {
					const line = line_id(st.trip, trip_mappings);

					return {
						line,
						name: lines?.[line]?.name ?? "???",
						headsign: lines?.[line]?.headsign ?? "",
						arrival: st.arrival,
						departure: st.departure,
						delay: rt_updates[line]?.delay,
						vehicle: rt_updates[line]?.vehicle,
					};
				}
			);
		}

		return stop_schedules as StopSchedules;
	}

	private async compute_line_schedules(system: string): Promise<LineSchedules> {
		console.debug(`computing line schedules for ${system}`);

		if (this.systems[system] === undefined) {
			throw new Error(`Transit system ${system} not found`);
		}

		const gtfs = await Promise.all(
			Object.keys(this.systems[system].raw_gtfs).map((gtfs) =>
				this.fetch_or_cached_gtfs(system, gtfs)
			)
		);

		const gtfs_stop_times: { [line in string]?: RawGtfs["stop_times"] } = {};
		for (const st of gtfs.flatMap((data) => data.stop_times)) {
			if (gtfs_stop_times[st.trip] !== undefined) {
				gtfs_stop_times[st.trip]?.push(st);
			} else {
				gtfs_stop_times[st.trip] = [st];
			}
		}

		const stops: { [stop in string]?: RawGtfs["stops"][number] } =
			Object.fromEntries(
				gtfs.flatMap((data) => data.stops).map((s) => [s.id, s])
			);

		const trip_mappings = await this.get_trip_mappings(system);

		const rt = await Promise.all(
			Object.entries(this.systems[system].raw_realtime)
				.filter(([_, rt]) => rt?.id !== undefined)
				.map(([rt, _]) => this.fetch_or_cached_realtime(system, rt))
		);

		const rt_updates: {
			[line in string]?: { vehicle?: string; delay?: number };
		} = Object.fromEntries(
			rt
				.map((rt) => rt.trip_updates)
				.filter((upd) => upd !== undefined)
				.flatMap((upd) =>
					upd
						.filter((u) => u.trip.trip !== undefined)
						.map((u) => ({ ...u, line: trip_mappings[u.trip.trip!] }))
						.filter((u) => u.line !== undefined)
						.map((u) => [u.line, { vehicle: u.vehicle, delay: u.delay }])
				)
		);

		const line_schedules: LineSchedules = {};

		for (const [trip, st] of Object.entries(gtfs_stop_times)) {
			const line = line_id(trip, trip_mappings);

			if (line_schedules[line] === undefined) {
				line_schedules[line] = (st as RawGtfs["stop_times"]).map(
					(st): LineSchedule => ({
						stop: st.stop,
						stop_name: stops[st.stop]?.name ?? "???",
						arrival: st.arrival,
						departure: st.departure,
						delay: rt_updates[line]?.delay,
						vehicle: rt_updates[line]?.vehicle,
					})
				);
			} else {
				line_schedules[line] = line_schedules[line].concat(
					(st as RawGtfs["stop_times"]).map(
						(st): LineSchedule => ({
							stop: st.stop,
							stop_name: stops[st.stop]?.name ?? "???",
							arrival: st.arrival,
							departure: st.departure,
							delay: rt_updates[line]?.delay,
							vehicle: rt_updates[line]?.vehicle,
						})
					)
				);
			}
		}

		return line_schedules;
	}

	private fetch_or_cached_gtfs(
		system: string,
		source: string
	): Promise<RawGtfs> {
		const raw = this.systems[system]?.raw_gtfs?.[source];

		if (raw === undefined) {
			throw new Error(
				`No configuration for GTFS source for ${system} from ${source}`
			);
		}

		if (raw.data !== undefined) {
			console.debug(`using cached GTFS from ${source}`);
			return raw.data;
		}

		const data = (async () => {
			const fetch_and_parse = (src: string, id: string): Promise<RawGtfs> => {
				return new Promise((resolve, reject) => {
					const { port1, port2 } = new MessageChannel();

					port1.onmessage = (ev) => {
						const {
							res,
							err,
						}:
							| { res: RawGtfs; err: undefined }
							| { err: unknown; res: undefined } = ev.data;

						if (err !== undefined) {
							reject(err);
						} else {
							resolve(res!);
						}
					};

					gtfs_worker.postMessage({ port: port2, source: src, id_prefix: id }, [
						port2 as any,
					]);
				});
			};

			const invalidate = () => {
				setTimeout(() => {
					raw.data = undefined;

					if (this.systems[system] !== undefined) {
						this.systems[system].alerts = undefined;
						this.systems[system].vehicles = undefined;
						this.systems[system].stop_schedules = undefined;
						this.systems[system].line_schedules = undefined;
					}
				}, ms(raw.max_age));
			};

			try {
				return await fetch_and_parse(source, raw.id).then((res) => {
					invalidate();
					return res;
				});
			} catch (e) {
				console.warn(`Error getting GTFS data: ${e}, retrying`);
				await new Promise((resolve) => setTimeout(resolve, 1000));

				return await fetch_and_parse(source, raw.id).then((res) => {
					invalidate();
					return res;
				});
			}
		})();

		raw.data = data;
		return raw.data;
	}

	private fetch_or_cached_realtime(
		system: string,
		source: string
	): Promise<RawRealtime> {
		const raw = this.systems[system]?.raw_realtime?.[source];

		if (raw === undefined) {
			throw new Error(
				`No configuration for GTFS-RT source for ${system} from ${source}`
			);
		}

		if (raw.data !== undefined) {
			console.debug(`using cached GTFS-RT from ${source}`);
			return raw.data;
		}

		const data = (async () => {
			const fetch_and_parse = (
				src: string,
				id: string
			): Promise<RawRealtime> => {
				return new Promise((resolve, reject) => {
					const { port1, port2 } = new MessageChannel();

					port1.onmessage = (ev) => {
						const {
							res,
							err,
						}:
							| { res: RawRealtime; err: undefined }
							| { err: unknown; res: undefined } = ev.data;

						if (err !== undefined) {
							reject(err);
						} else {
							resolve(res!);
						}
					};

					realtime_worker.postMessage(
						{ port: port2, source: src, id_prefix: id },
						[port2 as any]
					);
				});
			};

			const invalidate = () =>
				setTimeout(async () => {
					raw.data = undefined;

					if (this.systems[system] !== undefined) {
						this.systems[system].alerts = undefined;
						this.systems[system].vehicles = undefined;
						this.systems[system].stop_schedules = undefined;
						this.systems[system].line_schedules = undefined;
					}
				}, ms(raw.max_age));

			try {
				return await fetch_and_parse(source, raw.id).then((res) => {
					invalidate();
					return res;
				});
			} catch (e) {
				console.warn(`Error getting GTFS-RT data: ${e}, retrying`);
				await new Promise((resolve) => setTimeout(resolve, 1000));

				return await fetch_and_parse(source, raw.id).then((res) => {
					invalidate();
					return res;
				});
			}
		})();

		raw.data = data;
		return raw.data;
	}
}

function line_id(
	trip_id: string | undefined,
	trip_mappings: { [trip in string]?: string }
): string {
	if (trip_id) {
		return trip_mappings[trip_id] ?? `???-${trip_id}`;
	}

	return "???";
}

function short_hash(str: string): string {
	const LENGTH = 16;

	return createHash("sha256")
		.update(str)
		.digest("base64url")
		.substring(0, LENGTH);
}
