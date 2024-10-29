import { Component, ComponentChild, ComponentChildren } from "preact";
import { navigate } from "wouter-preact/use-hash-location";
import L from "leaflet";

import railway_stop_icon from "../assets/icons/railway-stop.svg";
import coach_stop_icon from "../assets/icons/coach-stop.svg";
import metro_stop_icon from "../assets/icons/metro-stop.svg";
import monorail_stop_icon from "../assets/icons/monorail-stop.svg";
import bus_stop_icon from "../assets/icons/bus-stop.svg";
import trolleybus_stop_icon from "../assets/icons/trolleybus-stop.svg";
import tram_stop_icon from "../assets/icons/tram-stop.svg";
import water_stop_icon from "../assets/icons/water-stop.svg";
import air_stop_icon from "../assets/icons/air-stop.svg";
import ferry_stop_icon from "../assets/icons/ferry-stop.svg";
import aerial_stop_icon from "../assets/icons/aerial-stop.svg";
import funicular_stop_icon from "../assets/icons/funicular-stop.svg";
import taxi_stop_icon from "../assets/icons/taxi-stop.svg";
import other_stop_icon from "../assets/icons/other-stop.svg";

import railway_vehicle_icon from "../assets/icons/railway-vehicle.svg";
import coach_vehicle_icon from "../assets/icons/coach-vehicle.svg";
import metro_vehicle_icon from "../assets/icons/metro-vehicle.svg";
import monorail_vehicle_icon from "../assets/icons/monorail-vehicle.svg";
import bus_vehicle_icon from "../assets/icons/bus-vehicle.svg";
import trolleybus_vehicle_icon from "../assets/icons/trolleybus-vehicle.svg";
import tram_vehicle_icon from "../assets/icons/tram-vehicle.svg";
import water_vehicle_icon from "../assets/icons/water-vehicle.svg";
import air_vehicle_icon from "../assets/icons/air-vehicle.svg";
import ferry_vehicle_icon from "../assets/icons/ferry-vehicle.svg";
import aerial_vehicle_icon from "../assets/icons/aerial-vehicle.svg";
import funicular_vehicle_icon from "../assets/icons/funicular-vehicle.svg";
import taxi_vehicle_icon from "../assets/icons/taxi-vehicle.svg";
import other_vehicle_icon from "../assets/icons/other-vehicle.svg";

import layers from "../layers.json";
import "leaflet/dist/leaflet.css";
import style from "./map.module.css";
import "./map.css";
import { get_vehicles, get_stops, get_info, VehicleType } from "../api.ts";

export class Map extends Component<{
	children: ComponentChildren;
	system: string;
}> {
	private map: L.Map | undefined;
	private intervals: ReturnType<typeof setInterval>[] = [];

	componentDidMount() {
		this.set_up_map();
		this.set_up_markers();
	}

	componentDidUpdate({
		system: old_system,
	}: Readonly<{ children: ComponentChildren; system: string }>) {
		if (old_system !== this.props.system) {
			this.map?.remove();
			this.intervals.forEach((int) => clearInterval(int));

			this.set_up_map();
			this.set_up_markers();
		}
	}

	componentWillUnmount() {
		this.map?.remove();
		this.intervals.forEach((int) => clearInterval(int));
	}

	render({
		children,
	}: Readonly<{
		children: ComponentChildren;
		system: string;
	}>): ComponentChild {
		return (
			<div class={style.wrapper}>
				<section class={style.sidebar}>{children}</section>
				<section id="map-container" class={style.map}></section>
			</div>
		);
	}

	private set_up_map() {
		const maps = Object.fromEntries(
			layers.maps.map((l) => [
				`<img src="${l.url.replace(/\{[rsxyz]\}/gu, (m) =>
					(layers.icon as { [key: string]: { toString: () => string } })[
						m
					].toString()
				)}" class="map-layer-icon" /> <span class="map-layer-name">${
					l.name
				}</span>`,
				L.tileLayer(l.url, {
					crossOrigin: "anonymous",
					attribution: l.attribution,
				}),
			])
		);

		const overlays = Object.fromEntries(
			layers.overlays.map((l) => [
				`<img src="${l.url.replace(/\{[rsxyz]\}/gu, (m) =>
					(layers.icon as { [key: string]: { toString: () => string } })[
						m
					].toString()
				)}" class="map-layer-icon" /> <span class="map-layer-name">${
					l.name
				}</span>`,
				L.tileLayer(l.url, {
					crossOrigin: "anonymous",
					attribution: l.attribution,
				}),
			])
		);

		this.map = L.map("map-container", {
			center: [0, 0],
			zoom: 2,
			layers: [Object.values(maps)[0]],
			zoomControl: true,
			doubleClickZoom: false,
		});

		L.control.layers(maps, overlays, { autoZIndex: false }).addTo(this.map);
		L.control
			.scale({
				imperial: false,
				maxWidth: 300,
			})
			.addTo(this.map);

		get_info(this.props.system).then((info) => {
			if (info?.location !== undefined) {
				this.map?.flyToBounds(info.location);
			}
		});
	}

	private set_up_markers() {
		get_stops(this.props.system).then((stops) => {
			if (stops !== undefined && this.map !== undefined) {
				const map = this.map;
				const stop_markers: L.Marker[] = [];

				const zoom = Math.pow(map.getZoom() / 22, 3);

				for (const stop of stops) {
					stop_markers.push(
						L.marker([stop.lat, stop.lon], {
							title: `${stop.name} (${[
								...new Set(stop.lines.map((l) => l.name)),
							]
								.sort()
								.sort((a, b) => a.length - b.length)
								.join(", ")})`,
							draggable: false,
							icon: L.icon({
								iconUrl: stop_icon(stop.types[0] ?? VehicleType.Other),
								iconSize: [zoom * 48, zoom * 64],
							}),
						})
							.addTo(map)
							.on("click", () =>
								navigate(`/${this.props.system}/stop/${stop.id}`)
							)
					);
				}

				map.on("zoomend", () => {
					const zoom = Math.pow(map.getZoom() / 22, 3);

					for (const marker of stop_markers) {
						marker.setIcon(
							L.icon({
								iconUrl: marker.getIcon().options.iconUrl!,
								iconSize: [zoom * 48, zoom * 64],
							})
						);
					}
				});
			}
		});

		get_vehicles(this.props.system).then((vehicles) => {
			if (vehicles !== undefined && this.map !== undefined) {
				const map = this.map;
				const vehicle_markers = new globalThis.Map<string, L.Marker>();

				const zoom = Math.pow(map.getZoom() / 22, 3);

				for (const vehicle of vehicles) {
					vehicle_markers.set(
						vehicle.id,
						L.marker([vehicle.lat, vehicle.lon], {
							title: `${vehicle.line_name} ${vehicle.headsign} (${vehicle.name})`,
							draggable: false,
							icon: L.icon({
								iconUrl: vehicle_icon(vehicle.type),
								iconSize: [zoom * 64, zoom * 64],
							}),
						})
							.addTo(map)
							.on("click", () =>
								navigate(`/${this.props.system}/line/${vehicle.line}`)
							)
					);
				}

				map.on("zoomend", () => {
					const zoom = Math.pow(map.getZoom() / 22, 3);

					for (const marker of vehicle_markers.values()) {
						marker.setIcon(
							L.icon({
								iconUrl: marker.getIcon().options.iconUrl!,
								iconSize: [zoom * 64, zoom * 64],
							})
						);
					}
				});

				this.intervals.push(
					setInterval(async () => {
						const vehicles = (await get_vehicles(this.props.system)) ?? [];

						for (const [id, marker] of vehicle_markers) {
							if (vehicles.find((v) => v.id === id) === undefined) {
								marker.remove();
								vehicle_markers.delete(id);
							}
						}

						for (const vehicle of vehicles) {
							const marker = vehicle_markers.get(vehicle.id);

							if (marker !== undefined) {
								marker.setLatLng([vehicle.lat, vehicle.lon]);
							} else {
								const zoom = Math.pow(map.getZoom() / 22, 3);

								vehicle_markers.set(
									vehicle.id,
									L.marker([vehicle.lat, vehicle.lon], {
										title: `${vehicle.line_name} ${vehicle.headsign} (${vehicle.name})`,
										draggable: false,
										icon: L.icon({
											iconUrl: vehicle_icon(vehicle.type),
											iconSize: [zoom * 64, zoom * 64],
										}),
									})
										.addTo(map)
										.on("click", () =>
											navigate(`/${this.props.system}/line/${vehicle.line}`)
										)
								);
							}
						}
					}, 5000)
				);
			}
		});
	}
}

function stop_icon(type: VehicleType): string {
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

function vehicle_icon(type: VehicleType): string {
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
