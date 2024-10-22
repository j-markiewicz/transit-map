import * as csv from "csv";
import * as unzip from "yauzl-promise";
import { Readable } from "stream";

import { RawGtfs, VehicleType } from "./types.js";
import { parentPort } from "worker_threads";

parentPort?.on("message", (data) => {
	try {
		const { port, source, id_prefix } = data;

		console.debug(`gtfs_worker <-- ${JSON.stringify(data)}`);

		const send = (msg: any) => {
			const json = JSON.stringify(msg);
			console.debug(
				`gtfs_worker --> ${
					json.length > 120 ? json.substring(0, 115) + "..." : json
				}`
			);
			port.postMessage(msg);
		};

		fetch_and_parse_gtfs(source, id_prefix).then(
			(res) => send({ res }),
			(err) => send({ err })
		);
	} catch (e) {
		console.error(`Error in GTFS worker: ${e}`);
	}
});

async function fetch_and_parse_gtfs(
	source: string,
	id_prefix: string | undefined
): Promise<RawGtfs> {
	const id = (unprefixed: string): string =>
		id_prefix ? `${id_prefix}-${unprefixed}` : unprefixed;

	const routes: RawGtfs["routes"] = [];
	const trips: RawGtfs["trips"] = [];
	const stops: RawGtfs["stops"] = [];
	const stop_times: RawGtfs["stop_times"] = [];
	let shapes: RawGtfs["shapes"] | undefined = undefined;

	console.info(`fetch(${source})`);
	const res = await fetch(source, {
		headers: { "User-Agent": `transit-map (Node.js ${process.version})` },
	});

	if (!res.ok) {
		throw new Error(
			`External GTFS API call to ${source} failed: ${res.status} ${res.statusText}`
		);
	}

	const zip = new Uint8Array(await res.arrayBuffer());
	console.debug(`fetched ${source}`);

	const unzipper = await unzip.fromBuffer(Buffer.from(zip));
	const files: { [key in string]?: Readable | null } = {
		"routes.txt": null,
		"trips.txt": null,
		"stops.txt": null,
		"stop_times.txt": null,
		"shapes.txt": null,
	};

	for await (const file of unzipper) {
		if (files[file.filename] !== undefined) {
			files[file.filename] = await file.openReadStream();
		}
	}

	const required_files = [
		"routes.txt",
		"trips.txt",
		"stops.txt",
		"stop_times.txt",
	];

	function has_required_files(files: {
		[key in string]?: Readable | null;
	}): files is {
		"routes.txt": Readable;
		"trips.txt": Readable;
		"stops.txt": Readable;
		"stop_times.txt": Readable;
		"shapes.txt": Readable | null;
	} {
		return Object.keys(files)
			.filter((name) => required_files.includes(name))
			.every((name) => files[name] !== null);
	}

	if (!has_required_files(files)) {
		const missing_files = Object.keys(files)
			.filter((name) => required_files.includes(name))
			.filter((name) => files[name] === null);

		throw new Error(
			`Missing required GTFS file(s) ${JSON.stringify(
				missing_files
			)} in ${source}`
		);
	}

	console.debug(`unzipped ${source}`);

	for await (const record of files["routes.txt"].pipe(
		csv.parse({ columns: true })
	)) {
		routes.push({
			id: id(record["route_id"]),
			name: record["route_short_name"] || record["route_long_name"],
			type: vehicle_type(JSON.parse(record["route_type"])),
		});
	}

	console.debug(`parsed ${routes.length} routes from ${source}`);

	for await (const record of files["trips.txt"].pipe(
		csv.parse({ columns: true })
	)) {
		trips.push({
			id: id(record["trip_id"]),
			headsign: record["trip_headsign"],
			route: id(record["route_id"]),
			shape: record["shape_id"] ? id(record["shape_id"]) : undefined,
		});
	}

	console.debug(`parsed ${trips.length} trips from ${source}`);

	for await (const record of files["stops.txt"].pipe(
		csv.parse({ columns: true })
	)) {
		if (record["location_type"] === "" || record["location_type"] === "0") {
			stops.push({
				id: id(record["stop_id"]),
				name: record["stop_name"],
				lat: record["stop_lat"],
				lon: record["stop_lon"],
			});
		}
	}

	console.debug(`parsed ${stops.length} stops from ${source}`);

	for await (const record of files["stop_times.txt"].pipe(
		csv.parse({ columns: true })
	)) {
		stop_times.push({
			stop: id(record["stop_id"]),
			trip: id(record["trip_id"]),
			sequence: JSON.parse(record["stop_sequence"]),
			departure: record["departure_time"] || undefined,
			arrival: record["arrival_time"] || undefined,
		});
	}

	console.debug(`parsed ${stop_times.length} stop_times from ${source}`);

	if (files["shapes.txt"] !== null) {
		shapes = [];
		for await (const record of files["shapes.txt"].pipe(
			csv.parse({ columns: true })
		)) {
			shapes.push({
				id: id(record["shape_id"]),
				lat: record["shape_pt_lat"],
				lon: record["shape_pt_lon"],
				sequence: JSON.parse(record["shape_pt_sequence"]),
			});
		}

		console.debug(`parsed ${shapes.length} shapes from ${source}`);
	} else {
		console.debug(`no shapes in ${source}`);
	}

	return {
		routes,
		trips,
		stops,
		stop_times,
		shapes,
	};
}

function vehicle_type(t: number): VehicleType {
	// Single-digit types are from the GTFS spec:
	// https://gtfs.org/documentation/schedule/reference/#field-definitions
	// Multi-digit types are from a Google GTFS extension:
	// https://developers.google.com/transit/gtfs/reference/extended-route-types

	if (t === 2 || (t >= 100 && t <= 117)) {
		return VehicleType.Railway;
	} else if (t >= 200 && t <= 209) {
		return VehicleType.Coach;
	} else if (t === 1 || (t >= 400 && t <= 404)) {
		return VehicleType.Metro;
	} else if (t === 12 || t === 405) {
		return VehicleType.Monorail;
	} else if (t === 3 || (t >= 700 && t <= 716)) {
		return VehicleType.Bus;
	} else if (t === 11 || t === 800) {
		return VehicleType.Trolleybus;
	} else if (t === 0 || t === 5 || (t >= 900 && t <= 906)) {
		return VehicleType.Tram;
	} else if (t === 1000) {
		return VehicleType.Water;
	} else if (t === 1100) {
		return VehicleType.Air;
	} else if (t === 4 || t === 1200) {
		return VehicleType.Ferry;
	} else if (t === 6 || (t >= 1300 && t <= 1307)) {
		return VehicleType.Aerial;
	} else if (t === 7 || t === 1400) {
		return VehicleType.Funicular;
	} else if (t >= 1500 && t <= 1507) {
		return VehicleType.Taxi;
	} else {
		return VehicleType.Other;
	}
}
