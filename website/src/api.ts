import { LineString } from "geojson";

const url = (path: string) => new URL(path, import.meta.env.VITE_MAP_API_BASE);

export async function get_all_info(): Promise<BasicSystemInfo[] | undefined> {
	return fetch(url(""))
		.then((res) => res.json())
		.catch(() => undefined);
}

export async function get_info(
	system: string
): Promise<BasicSystemInfo | undefined> {
	return fetch(url(`${system}`))
		.then((res) => res.json())
		.catch(() => undefined);
}

export async function get_alerts(system: string): Promise<Alert[] | undefined> {
	return fetch(url(`${system}/alerts`))
		.then((res) => res.json())
		.catch(() => undefined);
}

export async function get_vehicles(
	system: string
): Promise<Vehicle[] | undefined> {
	return fetch(url(`${system}/vehicles`))
		.then((res) => res.json())
		.catch(() => undefined);
}

export async function get_stops(system: string): Promise<Stop[] | undefined> {
	return fetch(url(`${system}/stops`))
		.then((res) => res.json())
		.catch(() => undefined);
}

export async function get_lines(system: string): Promise<Line[] | undefined> {
	return fetch(url(`${system}/lines`))
		.then((res) => res.json())
		.catch(() => undefined);
}

export async function get_stop_schedule(
	system: string,
	stop: string
): Promise<StopSchedule | undefined> {
	return fetch(url(`${system}/stop_schedule/${stop}`))
		.then((res) => res.json())
		.catch(() => undefined);
}

export async function get_line_schedule(
	system: string,
	line: string
): Promise<LineSchedule | undefined> {
	return fetch(url(`${system}/line_schedule/${line}`))
		.then((res) => res.json())
		.catch(() => undefined);
}

export async function get_shape(
	system: string,
	shape: string
): Promise<LineString | undefined> {
	return fetch(url(`${system}/shape/${shape}`))
		.then((res) => res.json())
		.catch(() => undefined);
}

export enum VehicleType {
	Railway = 100,
	Coach = 200,
	Metro = 400,
	Monorail = 405,
	Bus = 700,
	Trolleybus = 800,
	Tram = 900,
	Water = 1000,
	Air = 1100,
	Ferry = 1200,
	Aerial = 1300,
	Funicular = 1400,
	Taxi = 1500,
	Other = 1700,
}

export type LatLon = [number, number];
export type TimeInterval =
	| [undefined, number]
	| [number, undefined]
	| [number, number];

/** basic information about a transit system */
export type BasicSystemInfo = {
	/** the name (and also id) of this transit system */
	name: string;
	/** approximate location of this system as a bounding box */
	location: [LatLon, LatLon];
	/** number of gtfs schedule sources for this system */
	gtfs_sources: number;
	/** number of gtfs realtime sources for this system */
	rt_sources: number;
	/** number of stops in this system, if immediately known */
	stops: number | undefined;
	/** number of lines in this system, if immediately known */
	lines: number | undefined;
};

/** an alert */
export type Alert = {
	/** the time during which this alert is active */
	time?: TimeInterval;
	/** brief informational text about this alert */
	info: string;
	/** detailed informational text about this alert */
	details: string;
};

/** a stop */
export type Stop = {
	/** unique identifier of this stop */
	id: string;
	/** user-facing name of this stop */
	name: string;
	/** types of vehicle serving this stop, sorted by prevalence */
	types: VehicleType[];
	/** latitude of this stop */
	lat: number;
	/** longitude of this stop */
	lon: number;
	/** lines, which stop at this stop */
	lines: {
		/** identifier of the line */
		id: string;
		/** user-facing name of the line */
		name: string;
		/** headsign of the line */
		headsign: string;
	}[];
};

/** a vehicle */
export type Vehicle = {
	/** unique identifier of the vehicle */
	id: string;
	/** user-facing name of the vehicle */
	name: string;
	/** type of the vehicle */
	type: VehicleType;
	/** latitude of the vehicle */
	lat: number;
	/** longitude of the vehicle */
	lon: number;
	/** heading/bearing of the vehicle, if known */
	hdg: number | undefined;
	/** line identifier of the vehicle */
	line: string;
	/** user-facing name of the line */
	line_name: string;
	/** headsign of the vehicle/line */
	headsign: string;
};

/** a transit line */
export type Line = {
	/** unique identifier of the line */
	id: string;
	/** user-facing name of the line */
	name: string;
	/** headsign of the line */
	headsign: string;
	/** stops of the line, in service order */
	stops: {
		/** unique identifier of the stop */
		id: string;
		/** user-facing name of the stop */
		name: string;
		/** latitude of the stop */
		lat: number;
		/** longitude of the stop */
		lon: number;
	}[];
	/** vehicle type used on the line */
	type: VehicleType;
	/** identifier(s) of the path(s) of the line */
	shape: string[];
};

/** a single scheduled stop at a transit stop */
export type StopSchedule = {
	/** transit line stopping at this stop */
	line: string;
	/** the line's name */
	name: string;
	/** the line's headsign */
	headsign: string;
	/** arrival time */
	arrival: string;
	/** departure time */
	departure: string;
	/** vehicle identifier serving this stop, if known */
	vehicle?: string;
};

/** a single scheduled stop by a transit line */
export type LineSchedule = {
	/** stop identifier */
	stop: string;
	/** user-facing stop name */
	stop_name: string;
	/** arrival time */
	arrival: string;
	/** departure time */
	departure: string;
	/** transit vehicle serving this stop, if known */
	vehicle?: string;
};
