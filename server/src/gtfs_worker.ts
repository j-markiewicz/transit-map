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
	let calendar: RawGtfs["calendar"] | undefined = undefined;
	let calendar_dates: RawGtfs["calendar_dates"] | undefined = undefined;

	console.info(`fetch(${source})`);

	let res;
	try {
		res = await fetch(source, {
			headers: { "User-Agent": `transit-map (Node.js ${process.version})` },
		});
	} catch (e: any) {
		if ("cause" in e) {
			throw new Error(
				`External GTFS API call to ${source} failed: ${e.cause} (${e})`
			);
		}

		throw new Error(`External GTFS API call to ${source} failed: ${e}`);
	}

	if (!res.ok) {
		throw new Error(
			`External GTFS API call to ${source} failed: ${res.status} ${res.statusText}`
		);
	}

	const zip = new Uint8Array(await res.arrayBuffer());
	console.debug(`fetched ${source}`);

	const unzipper = await unzip.fromBuffer(Buffer.from(zip));
	const files: { [key in string]?: Readable | null } = {
		"agency.txt": null,
		"routes.txt": null,
		"trips.txt": null,
		"stops.txt": null,
		"stop_times.txt": null,
		"calendar.txt": null,
		"calendar_dates.txt": null,
		"shapes.txt": null,
	};

	for await (const file of unzipper) {
		if (files[file.filename] !== undefined) {
			files[file.filename] = await file.openReadStream();
		}
	}

	const required_files = [
		"agency.txt",
		"routes.txt",
		"trips.txt",
		"stops.txt",
		"stop_times.txt",
	];

	function has_required_files(files: {
		[key in string]?: Readable | null;
	}): files is {
		"agency.txt": Readable;
		"routes.txt": Readable;
		"trips.txt": Readable;
		"stops.txt": Readable;
		"stop_times.txt": Readable;
		"shapes.txt": Readable | null;
		"calendar.txt": Readable | null;
		"calendar_dates.txt": Readable | null;
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

	const timezone: string = (
		await files["agency.txt"]
			.pipe(csv.parse({ columns: true }))
			[Symbol.asyncIterator]()
			.next()
	).value["agency_timezone"];

	console.debug(`parsed a timezone from ${source}`);

	for await (const record of files["routes.txt"].pipe(
		csv.parse({ columns: true })
	)) {
		routes.push({
			id: id(record["route_id"]),
			name: record["route_short_name"] || record["route_long_name"],
			type: vehicle_type(parseInt(record["route_type"])),
		});
	}

	console.debug(`parsed ${routes.length} routes from ${source}`);

	for await (const record of files["trips.txt"].pipe(
		csv.parse({ columns: true })
	)) {
		trips.push({
			id: id(record["trip_id"]),
			service: id(record["service_id"]),
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
				lat: parseFloat(record["stop_lat"]),
				lon: parseFloat(record["stop_lon"]),
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
			sequence: parseInt(record["stop_sequence"]),
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
				lat: parseFloat(record["shape_pt_lat"]),
				lon: parseFloat(record["shape_pt_lon"]),
				sequence: parseInt(record["shape_pt_sequence"]),
			});
		}

		console.debug(`parsed ${shapes.length} shapes from ${source}`);
	} else {
		console.debug(`no shapes in ${source}`);
	}

	if (files["calendar.txt"] !== null) {
		calendar = [];
		for await (const record of files["calendar.txt"].pipe(
			csv.parse({ columns: true })
		)) {
			calendar.push({
				id: id(record["service_id"]),
				monday: record["monday"] === "1",
				tuesday: record["tuesday"] === "1",
				wednesday: record["wednesday"] === "1",
				thursday: record["thursday"] === "1",
				friday: record["friday"] === "1",
				saturday: record["saturday"] === "1",
				sunday: record["sunday"] === "1",
				start_date: record["start_date"],
				end_date: record["end_date"],
			});
		}

		console.debug(`parsed ${calendar.length} calendar entries from ${source}`);
	} else {
		console.debug(`no calendar entries in ${source}`);
	}

	if (files["calendar_dates.txt"] !== null) {
		calendar_dates = [];
		for await (const record of files["calendar_dates.txt"].pipe(
			csv.parse({ columns: true })
		)) {
			calendar_dates.push({
				id: id(record["service_id"]),
				date: record["date"],
				type: record["exception_type"] === "1" ? "added" : "removed",
			});
		}

		console.debug(
			`parsed ${calendar_dates.length} calendar dates from ${source}`
		);
	} else {
		console.debug(`no calendar dates in ${source}`);
	}

	if (calendar === null && calendar_dates === null) {
		throw new Error(
			`calendar.txt and calendar_dates.txt are both missing from ${source}, at least one must be present`
		);
	}

	return {
		timezone,
		routes,
		trips,
		stops,
		stop_times,
		shapes,
		calendar,
		calendar_dates,
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
