import { LineString } from "geojson";
import { Temporal } from "temporal-polyfill";

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

export class Lazy<T> {
	private fn: (() => T) | undefined;
	private val: T | typeof this.nothing;
	private nothing: symbol;

	constructor(fn: () => T) {
		this.fn = fn;
		this.nothing = Symbol("no value");
		this.val = this.nothing;
	}

	public get(): T {
		if (this.val !== this.nothing) {
			return this.val as T;
		}

		if (this.fn === undefined) {
			throw new Error("Lazy has no value and no function");
		}

		this.val = this.fn();
		this.fn = undefined;
		return this.val;
	}

	public toString(): string {
		return `${this.get()}`;
	}
}

export type LatLon = [number, number];
export type TimeInterval = [null, number] | [number, null] | [number, number];

export type RawGtfs = {
	/** timezone used in this dataset, parsed from agency.txt */
	timezone: string;
	/** parsed contents of routes.txt */
	routes: {
		/** unique identifier for this route */
		id: string;
		/** user-facing name of this route */
		name: string;
		/** vehicle type used on this route */
		type: VehicleType;
	}[];
	/** parsed contents of trips.txt */
	trips: {
		/** unique identifier of this trip */
		id: string;
		/** identifier of the route this trip belongs to */
		route: string;
		/** identifier of the service this trip is scheduled under */
		service: string;
		/** headsign used on this trip (usually the destination stop name) */
		headsign: string;
		/** identifier of the shape for this trip */
		shape?: string;
	}[];
	/** parsed contents of stops.txt */
	stops: {
		/** unique identifier of this stop */
		id: string;
		/** user-facing name of this stop */
		name: string;
		/** latitude in degrees of this stop */
		lat: number;
		/** longitude in degrees of this stop */
		lon: number;
	}[];
	/** parsed contents of stop_times.txt */
	stop_times: {
		/** identifier of the trip this stop time describes */
		trip: string;
		/** identifier of the stop this stop time applies to */
		stop: string;
		/** sequence number of this stop in the trip */
		sequence: number;
		/** arrival time */
		arrival: string | undefined;
		/** departure time */
		departure: string | undefined;
	}[];
	/** parsed contents of shapes.txt, if present */
	shapes?: {
		/** identifier of the shape this point belongs to */
		id: string;
		/** latitude in degrees of this shape point */
		lat: number;
		/** longitude in degrees of this shape point */
		lon: number;
		/** sequence number of this shape point within its shape */
		sequence: number;
	}[];
	/** parsed contents of calendar.txt, if present */
	calendar?: {
		/** identifier of the service this entry describes */
		id: string;
		/** whether this service operates on mondays */
		monday: boolean;
		/** whether this service operates on tuesdays */
		tuesday: boolean;
		/** whether this service operates on wednesdays */
		wednesday: boolean;
		/** whether this service operates on thursdays */
		thursday: boolean;
		/** whether this service operates on fridays */
		friday: boolean;
		/** whether this service operates on saturdays */
		saturday: boolean;
		/** whether this service operates on sundays */
		sunday: boolean;
		/** first date of this service */
		start_date: string;
		/** last date of this service */
		end_date: string;
	}[];
	/** parsed contents of calendar_dates.txt, if present */
	calendar_dates?: {
		/** id of the service this entry applies to */
		id: string;
		/** date on which this entry applies */
		date: string;
		/** whether service was added or removed */
		type: "added" | "removed";
	}[];
};

export type RawRealtime = {
	/** parsed vehicle positions */
	positions?: {
		/** unique identifier of this vehicle */
		id: string;
		/** user-facing identifier of this vehicle */
		name: string;
		/** identifier of the trip this vehicle is serving, if known */
		trip: string | undefined;
		/** timestamp of this position measurement */
		ts: number;
		/** latitude in degrees of the vehicle */
		lat: number;
		/** longitude in degrees of the vehicle */
		lon: number;
		/** heading/bearing in degrees of the vehicle, if known */
		hdg: number | undefined;
		/** the sequence number or id of the next or current stop for this vehicle, if known */
		stop: number | string | undefined;
	}[];
	/** parsed trip updates */
	trip_updates?: {
		/** descriptor of the trip this update applies to */
		trip: {
			/** identifier of the trip */
			trip?: string;
			/** identifier of the route */
			route?: string;
			/** start time of the trip */
			start_time?: string;
			/** start date of the trip */
			start_date?: string;
		};
		/** vehicle identifier that this update applies to, if known */
		vehicle?: string;
		/** updates to arrival/departure times of stops for this trip */
		updates: {
			/** stop sequence or id */
			stop: number | string;
			/** information about the arrival time, if arrival and departure are both missing, this stop is skipped */
			arrival?: {
				delay?: number;
				time?: number;
				uncertainty?: number;
			};
			/** information about the departure time, if arrival and departure are both missing, this stop is skipped */
			departure?: {
				delay?: number;
				time?: number;
				uncertainty?: number;
			};
		}[];
	}[];
	/** parsed alerts */
	alerts?: {
		/** target descriptors of this alert */
		targets: {
			/** route identifier this alert applies to, if any */
			route?: string;
			/** route vehicle type this alert applies to, if any */
			route_type?: number;
			/** trip identifier this alert applies to, if any */
			trip?: string;
			/** stop identifier this alert applies to, if any */
			stop?: string;
		}[];
		/** start time of the alert's active time, if any */
		start?: number;
		/** end time of the alert's active time, if any */
		end?: number;
		/** brief information text about this alert */
		info: string;
		/** detailed information text about this alert */
		details: string;
	}[];
};

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
	/** lines that stop at this stop */
	lines: {
		/** identifier of the line */
		id: string;
		/** user-facing name of the line */
		name: string;
		/** headsign of the line */
		headsign: string;
		/** type of vehicle used on this line */
		type: VehicleType;
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

/** information about transit lines */
export type LinesInfo = {
	/** transit lines */
	lines: Line[];
	/** transit line shapes */
	shapes: {
		[shape in string]?: LineString;
	};
	/** mapping from gtfs trip ids to line and service ids */
	trip_mappings: { [key in string]?: { line: string; service: string } };
};

/** information about a stop and its schedule */
export type StopSchedule = Stop & {
	/** this stop's scheduled stops */
	schedule: {
		/** transit line stopping at this stop */
		line: string;
		/** the line's name */
		name: string;
		/** the line's headsign */
		headsign: string;
		/** the line's type */
		type: VehicleType;
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

/** arrival and departure times of stops */
export type StopSchedules = {
	[stop in string]?: Lazy<StopSchedule>;
};

/** information about a line and its schedule */
export type LineSchedule = Line & {
	/** this line's scheduled stops */
	schedule: {
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
		/** this stop's delay and its uncertainty in seconds, if known */
		delay?: [number, number | undefined];
	}[];
};

/** arrival and departure times of lines */
export type LineSchedules = {
	[line in string]?: Lazy<LineSchedule>;
};

/** information about a transit system */
export type SystemInfo = {
	/** bounding box around (most of) the system, used for initial map position */
	location: [LatLon, LatLon];
	/** gtfs schedule data sources and their data */
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
			/** cached data */
			data?: Promise<RawGtfs>;
		};
	};
	/** gtfs realtime data sources and their data */
	realtime: {
		[source in string]?: {
			/** identifier of the gtfs source that ids within this data should be resolved in */
			id: string;
			/** maximum age of the cached data */
			max_age: string;
			/** cached data */
			data?: Promise<RawRealtime>;
		};
	};
	/** cached alerts */
	alerts: Promise<Alert[]> | undefined;
	/** cached vehicles */
	vehicles: Promise<Vehicle[]> | undefined;
	/** cached stops */
	stops: Promise<Stop[]> | undefined;
	/** cached lines */
	lines: Promise<LinesInfo> | undefined;
	/** cached stop schedules */
	stop_schedules: Promise<StopSchedules> | undefined;
	/** cached line schedules */
	line_schedules: Promise<LineSchedules> | undefined;
	/** cached service schedules */
	services:
		| Promise<{
				/** dates that a service operates on */
				[service in string]?: Temporal.ZonedDateTime[];
		  }>
		| undefined;
};

/** configuration of a transit system, subset of `SystemInfo` */
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
