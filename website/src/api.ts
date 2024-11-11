import { LineString } from "geojson";

const url = (path: string) => new URL(path, import.meta.env.VITE_MAP_API_BASE);

export async function get_all_info(): Promise<BasicSystemInfo[] | undefined> {
	return fetch(url(""), { priority: "high" })
		.then((res) => res.json())
		.catch((err) => {
			console.error(`API error fetching all info: ${err}`);
			return undefined;
		});
}

export async function get_info(
	system: string
): Promise<BasicSystemInfo | undefined> {
	return fetch(url(`${system}`), { priority: "high" })
		.then((res) => res.json())
		.catch((err) => {
			console.error(`API error fetching info: ${err}`);
			return undefined;
		});
}

export async function get_config(
	system: string
): Promise<(SystemConfig & { can_edit: boolean }) | undefined> {
	return fetch(url(`${system}/config`), { priority: "high" })
		.then((res) => res.json())
		.catch((err) => {
			console.error(`API error fetching config: ${err}`);
			return undefined;
		});
}

export async function post_config(
	config: SystemConfig & { name: string }
): Promise<boolean | undefined> {
	return fetch(url(`new`), {
		method: "POST",
		body: JSON.stringify(config),
		headers: { "Content-Type": "application/json" },
	})
		.then((res) => res.ok)
		.catch((err) => {
			console.error(`API error posting config: ${err}`);
			return undefined;
		});
}

export async function put_config(
	system: string,
	config: SystemConfig
): Promise<boolean | undefined> {
	return fetch(url(`${system}/config`), {
		method: "PUT",
		body: JSON.stringify(config),
		headers: { "Content-Type": "application/json" },
	})
		.then((res) => res.ok)
		.catch((err) => {
			console.error(`API error putting config: ${err}`);
			return undefined;
		});
}

export async function get_alerts(system: string): Promise<Alert[] | undefined> {
	return fetch(url(`${system}/alerts`))
		.then((res) => res.json())
		.catch((err) => {
			console.error(`API error fetching alerts: ${err}`);
			return undefined;
		});
}

export async function get_vehicles(
	system: string
): Promise<Vehicle[] | undefined> {
	return fetch(url(`${system}/vehicles`))
		.then((res) => res.json())
		.catch((err) => {
			console.error(`API error fetching vehicles: ${err}`);
			return undefined;
		});
}

export async function get_stops(system: string): Promise<Stop[] | undefined> {
	return fetch(url(`${system}/stops`))
		.then((res) => res.json())
		.catch((err) => {
			console.error(`API error fetching stops: ${err}`);
			return undefined;
		});
}

export async function get_lines(system: string): Promise<Line[] | undefined> {
	return fetch(url(`${system}/lines`))
		.then((res) => res.json())
		.catch((err) => {
			console.error(`API error fetching lines: ${err}`);
			return undefined;
		});
}

export async function get_line(
	system: string,
	line: string
): Promise<Line | undefined> {
	return fetch(url(`${system}/line/${line}`))
		.then((res) => res.json())
		.catch((err) => {
			console.error(`API error fetching line: ${err}`);
			return undefined;
		});
}

export async function get_stop(
	system: string,
	stop: string
): Promise<StopSchedule | undefined> {
	return fetch(url(`${system}/stop/${stop}`))
		.then((res) => res.json())
		.catch((err) => {
			console.error(`API error fetching stop: ${err}`);
			return undefined;
		});
}

export async function get_shape(
	system: string,
	shape: string
): Promise<LineString | undefined> {
	return fetch(url(`${system}/shape/${shape}`), { priority: "low" })
		.then((res) => res.json())
		.catch((err) => {
			console.error(`API error fetching shape: ${err}`);
			return undefined;
		});
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
export type TimeInterval = [null, number] | [number, null] | [number, number];

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

/** configuration for a transit system */
export type SystemConfig = {
	/** bounding box around (most of) the system, used for initial map position */
	location: [LatLon, LatLon];
	/** gtfs schedule data sources */
	gtfs: {
		[source in string]?: {
			/** unique identifier of this data source within the transit system
			 *
			 * may be left empty if there is either only one gtfs source in
			 * this transit system or all of this transit system's gtfs sources
			 * should be treated as though they were one source (and ids should
			 * always be resolved in all sources, but then ALL source ids in
			 * this transit system must be empty)
			 */
			id: string;
			/** maximum age of the cached data */
			max_age: string;
		};
	};
	/** gtfs realtime data sources */
	realtime: {
		[source in string]?: {
			/** identifier of the gtfs source that ids within this data should be resolved in */
			id: string;
			/** maximum age of the cached data */
			max_age: string;
		};
	};
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
	/** lines that stop at this stop */
	lines: {
		[line in string]?: {
			/** user-facing name of the line */
			name: string;
			/** headsign of the line */
			headsign: string;
			/** type of vehicle used on this line */
			type: VehicleType;
		};
	};
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
	/** the current delay of this vehicle and its uncertainty, if known */
	delay?: [number, number | undefined];
};

/** a transit line */
export type Line = {
	/** unique identifier of the line */
	id: string;
	/** user-facing name of the line */
	name: string;
	/** headsign of the line */
	headsign: string;
	/** the color of this line in rgb hex (without leading '#'), if specified in the source data */
	color: string | undefined;
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

/** information about a stop and its schedule */
export type StopSchedule = Stop & {
	/** this stop's schedule */
	schedule: {
		/** dates on which there are additional services */
		additional: string[];
		/** dates on which service may be removed or reduces */
		removed: string[];
		/** times at which lines stop at this stop per weekday */
		schedule: {
			[line in string]?: {
				/** mondays' schedule for this line */
				monday: [string, string][];
				/** tuesdays' schedule for this line */
				tuesday: [string, string][];
				/** wednesdays' schedule for this line */
				wednesday: [string, string][];
				/** thursdays' schedule for this line */
				thursday: [string, string][];
				/** fridays' schedule for this line */
				friday: [string, string][];
				/** saturdays' schedule for this line */
				saturday: [string, string][];
				/** sundays' schedule for this line */
				sunday: [string, string][];
			};
		};
	};
	/** this stop's scheduled arrivals */
	arrivals: {
		/** transit line stopping at this stop */
		line: string;
		/** arrival time */
		arrival: string;
		/** departure time */
		departure: string;
		/** vehicle identifier serving this stop, if known */
		vehicle?: string;
		/** this stop's delay and its uncertainty in seconds, if known */
		delay?: [number, number | undefined];
	}[];
};
