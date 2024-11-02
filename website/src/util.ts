import railway_stop_icon from "./assets/icons/railway-stop.svg";
import coach_stop_icon from "./assets/icons/coach-stop.svg";
import metro_stop_icon from "./assets/icons/metro-stop.svg";
import monorail_stop_icon from "./assets/icons/monorail-stop.svg";
import bus_stop_icon from "./assets/icons/bus-stop.svg";
import trolleybus_stop_icon from "./assets/icons/trolleybus-stop.svg";
import tram_stop_icon from "./assets/icons/tram-stop.svg";
import water_stop_icon from "./assets/icons/water-stop.svg";
import air_stop_icon from "./assets/icons/air-stop.svg";
import ferry_stop_icon from "./assets/icons/ferry-stop.svg";
import aerial_stop_icon from "./assets/icons/aerial-stop.svg";
import funicular_stop_icon from "./assets/icons/funicular-stop.svg";
import taxi_stop_icon from "./assets/icons/taxi-stop.svg";
import other_stop_icon from "./assets/icons/other-stop.svg";

import railway_vehicle_icon from "./assets/icons/railway-vehicle.svg";
import coach_vehicle_icon from "./assets/icons/coach-vehicle.svg";
import metro_vehicle_icon from "./assets/icons/metro-vehicle.svg";
import monorail_vehicle_icon from "./assets/icons/monorail-vehicle.svg";
import bus_vehicle_icon from "./assets/icons/bus-vehicle.svg";
import trolleybus_vehicle_icon from "./assets/icons/trolleybus-vehicle.svg";
import tram_vehicle_icon from "./assets/icons/tram-vehicle.svg";
import water_vehicle_icon from "./assets/icons/water-vehicle.svg";
import air_vehicle_icon from "./assets/icons/air-vehicle.svg";
import ferry_vehicle_icon from "./assets/icons/ferry-vehicle.svg";
import aerial_vehicle_icon from "./assets/icons/aerial-vehicle.svg";
import funicular_vehicle_icon from "./assets/icons/funicular-vehicle.svg";
import taxi_vehicle_icon from "./assets/icons/taxi-vehicle.svg";
import other_vehicle_icon from "./assets/icons/other-vehicle.svg";

import { VehicleType } from "./api";

/** Compare two series of strings
 *
 * The comparison of arrays is done lexically.
 *
 * The comparison of strings is done numerically if possible (i.e. "2" < "10"),
 * lexically if both strings are text (i.e. "ab" < "ac"), or numbers-first
 * otherwise (i.e. "123" < "a").
 *
 * Additionally, strings consisting of a text-only prefix and digit-only suffix
 * (or vice-versa) are treated as if the prefix and suffix were separate
 * entries in the array (i.e. "A2" < "A10", "2ABC" < "10A", and "20A" < "20B",
 * but "10A1" < "2A1").
 */
export function cmp(a: string[], b: string[]): number {
	const aa = a.flatMap((s) => {
		const matches = /(([^\d\s]+)(\d+))|((\d+)([^\d\s]+))/gu.exec(s);

		if (matches !== null && matches[1] !== undefined) {
			return [matches[2], matches[3]];
		} else if (matches !== null && matches[4] !== undefined) {
			return [matches[5], matches[6]];
		} else {
			return [s];
		}
	});

	const ab = b.flatMap((s) => {
		const matches = /(^([^\d\s]+)(\d+)$)|(^(\d+)([^\d\s]+)$)/gu.exec(s);

		if (matches !== null && matches[1] !== undefined) {
			return [matches[2], matches[3]];
		} else if (matches !== null && matches[4] !== undefined) {
			return [matches[5], matches[6]];
		} else {
			return [s];
		}
	});

	for (let i = 0; i < Math.min(aa.length, ab.length); i++) {
		const sa = aa[i];
		const sb = ab[i];
		const na = parseInt(sa);
		const nb = parseInt(sb);

		if (isFinite(na) && isFinite(nb)) {
			if (na - nb === 0) {
				continue;
			}

			return na - nb;
		} else if (isFinite(na) && !isFinite(nb)) {
			return -1;
		} else if (!isFinite(na) && isFinite(nb)) {
			return 1;
		} else {
			if (sa < sb) {
				return -1;
			} else if (sa > sb) {
				return 1;
			}
		}
	}

	return aa.length - ab.length;
}

export function get_type_name(type: VehicleType): string {
	switch (type) {
		case VehicleType.Railway:
			return "railway";
		case VehicleType.Coach:
			return "coach";
		case VehicleType.Metro:
			return "metro";
		case VehicleType.Monorail:
			return "monorail";
		case VehicleType.Bus:
			return "bus";
		case VehicleType.Trolleybus:
			return "trolleybus";
		case VehicleType.Tram:
			return "tram";
		case VehicleType.Water:
			return "water";
		case VehicleType.Air:
			return "air";
		case VehicleType.Ferry:
			return "ferry";
		case VehicleType.Aerial:
			return "aerial";
		case VehicleType.Funicular:
			return "funicular";
		case VehicleType.Taxi:
			return "taxi";
		case VehicleType.Other:
			return "other";
	}
}

export function get_stop_icon(type: VehicleType): string {
	switch (type) {
		case VehicleType.Railway:
			return railway_stop_icon;
		case VehicleType.Coach:
			return coach_stop_icon;
		case VehicleType.Metro:
			return metro_stop_icon;
		case VehicleType.Monorail:
			return monorail_stop_icon;
		case VehicleType.Bus:
			return bus_stop_icon;
		case VehicleType.Trolleybus:
			return trolleybus_stop_icon;
		case VehicleType.Tram:
			return tram_stop_icon;
		case VehicleType.Water:
			return water_stop_icon;
		case VehicleType.Air:
			return air_stop_icon;
		case VehicleType.Ferry:
			return ferry_stop_icon;
		case VehicleType.Aerial:
			return aerial_stop_icon;
		case VehicleType.Funicular:
			return funicular_stop_icon;
		case VehicleType.Taxi:
			return taxi_stop_icon;
		case VehicleType.Other:
			return other_stop_icon;
	}
}

export function get_vehicle_icon(type: VehicleType): string {
	switch (type) {
		case VehicleType.Railway:
			return railway_vehicle_icon;
		case VehicleType.Coach:
			return coach_vehicle_icon;
		case VehicleType.Metro:
			return metro_vehicle_icon;
		case VehicleType.Monorail:
			return monorail_vehicle_icon;
		case VehicleType.Bus:
			return bus_vehicle_icon;
		case VehicleType.Trolleybus:
			return trolleybus_vehicle_icon;
		case VehicleType.Tram:
			return tram_vehicle_icon;
		case VehicleType.Water:
			return water_vehicle_icon;
		case VehicleType.Air:
			return air_vehicle_icon;
		case VehicleType.Ferry:
			return ferry_vehicle_icon;
		case VehicleType.Aerial:
			return aerial_vehicle_icon;
		case VehicleType.Funicular:
			return funicular_vehicle_icon;
		case VehicleType.Taxi:
			return taxi_vehicle_icon;
		case VehicleType.Other:
			return other_vehicle_icon;
	}
}
