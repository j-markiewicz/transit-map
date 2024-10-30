import gtfs_rt from "gtfs-realtime-bindings";

import { RawRealtime } from "./types.js";
import { parentPort, threadId } from "worker_threads";

parentPort?.on("message", (data) => {
	try {
		const {
			port,
			req: { source, id_prefix },
		} = data;

		console.debug(`rt_worker[${threadId}] <-- ${JSON.stringify(data)}`);

		const send = (msg: any) => {
			const json = JSON.stringify(msg);
			console.debug(
				`rt_worker[${threadId}] --> ${
					json.length > 120 ? json.substring(0, 115) + "..." : json
				}`
			);
			port.postMessage(msg);
		};

		fetch_and_parse_realtime(source, id_prefix).then(
			(res) => send({ res }),
			(err) => send({ err })
		);
	} catch (e) {
		console.error(`Error in GTFS-RT worker: ${e}`);
	}
});

async function fetch_and_parse_realtime(
	source: string,
	id_prefix: string | undefined
): Promise<RawRealtime> {
	const id = (unprefixed: string | undefined) => {
		if (unprefixed === undefined) {
			return undefined;
		} else if (id_prefix === "") {
			return unprefixed;
		}

		return `${id_prefix}-${unprefixed}`;
	};

	const alerts: RawRealtime["alerts"] = [];
	const trip_updates: RawRealtime["trip_updates"] = [];
	const positions: RawRealtime["positions"] = [];

	console.info(`fetch(${source})`);

	let res;
	try {
		res = await fetch(source, {
			headers: { "User-Agent": `transit-map (Node.js ${process.version})` },
		});
	} catch (e: any) {
		if ("cause" in e) {
			throw new Error(
				`External GTFS-RT API call to ${source} failed: ${e.cause} (${e})`
			);
		}

		throw new Error(`External GTFS-RT API call to ${source} failed: ${e}`);
	}

	if (!res.ok) {
		throw new Error(
			`External GTFS-RT API call to ${source} failed: ${res.status} ${res.statusText}`
		);
	}

	const protobuf = new Uint8Array(await res.arrayBuffer());

	console.debug(`fetched ${source}`);

	const feed = gtfs_rt.transit_realtime.FeedMessage.decode(protobuf);

	feed.entity.forEach((entity) => {
		if (entity.alert !== undefined && entity.alert !== null) {
			const details = translated(entity.alert.descriptionText);
			const info = translated(entity.alert.headerText);

			const targets =
				entity.alert.informedEntity?.map((selector) => ({
					route: id(selector.routeId || selector.trip?.routeId || undefined),
					route_type: selector.routeType || undefined,
					trip: id(selector.trip?.tripId || undefined),
					stop: id(selector.stopId || undefined),
				})) ?? [];

			const start = entity.alert.activePeriod
				?.map((p) => num(p.start))
				.filter((n) => n !== undefined)
				.sort((a, b) => a - b)[0];

			const end = entity.alert.activePeriod
				?.map((p) => num(p.end))
				.filter((n) => n !== undefined)
				.sort((a, b) => b - a)[0];

			alerts.push({
				info,
				details,
				targets: targets,
				start,
				end,
			});
		}

		if (entity.tripUpdate !== undefined && entity.tripUpdate !== null) {
			const trip = {
				trip: id(entity.tripUpdate.trip?.tripId || undefined),
				route: id(entity.tripUpdate.trip?.routeId || undefined),
				start_time: entity.tripUpdate.trip.startTime || undefined,
				start_date: entity.tripUpdate.trip.startDate || undefined,
			};

			const vehicle = id(entity.tripUpdate.vehicle?.id || undefined);

			trip_updates.push({
				trip,
				vehicle,
				updates: (entity.tripUpdate.stopTimeUpdate ?? []).map((upd) => ({
					stop: upd.stopSequence ?? upd.stopId ?? "???",
					arrival: {
						time: num(upd.arrival?.time),
						delay: upd.arrival?.delay ?? undefined,
						uncertainty: upd.arrival?.uncertainty ?? undefined,
					},
					departure: {
						time: num(upd.departure?.time),
						delay: upd.departure?.delay ?? undefined,
						uncertainty: upd.departure?.uncertainty ?? undefined,
					},
				})),
			});
		}

		if (entity.vehicle !== undefined && entity.vehicle !== null) {
			const vid = id(entity.vehicle.vehicle?.id || undefined);
			const name =
				entity.vehicle.vehicle?.licensePlate ||
				entity.vehicle.vehicle?.label ||
				"";

			const trip = id(entity.vehicle.trip?.tripId ?? undefined);
			const ts = num(entity.vehicle.timestamp) ?? 0;
			const lat = entity.vehicle.position?.latitude;
			const lon = entity.vehicle.position?.longitude;
			const hdg = entity.vehicle.position?.bearing ?? undefined;

			if (vid !== undefined && lat !== undefined && lon !== undefined) {
				positions.push({ id: vid, name, trip, ts, lat, lon, hdg });
			}
		}
	});

	console.debug(
		`parsed ${
			alerts.length + positions.length + trip_updates.length
		} realtime entities from ${source}`
	);

	return {
		alerts,
		positions,
		trip_updates,
	};
}

function translated(
	str:
		| gtfs_rt.transit_realtime.TranslatedString
		| gtfs_rt.transit_realtime.ITranslatedString
		| null
		| undefined
): string {
	return (
		(
			str?.translation?.find(
				(tr) =>
					tr.language === undefined ||
					tr.language?.startsWith("pl") ||
					tr.language?.startsWith("en")
			) ?? str?.translation?.[0]
		)?.text ?? "???"
	);
}

function num(
	n: gtfs_rt.transit_realtime.VehiclePosition["timestamp"] | null | undefined
): number | undefined {
	if (typeof n === "number") {
		return n;
	}

	return n?.toNumber();
}
