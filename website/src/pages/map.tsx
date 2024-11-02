import { Component, ComponentChild, ComponentChildren } from "preact";
import { navigate } from "wouter-preact/use-hash-location";
import L from "leaflet";

import layers from "../layers.json";
import "leaflet/dist/leaflet.css";
import style from "./map.module.css";
import "./map.css";
import { get_vehicles, get_stops, get_info, VehicleType } from "../api.ts";
import { get_stop_icon, get_vehicle_icon } from "../util.ts";

export default class Map extends Component<{
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
								iconUrl: get_stop_icon(stop.types[0] ?? VehicleType.Other),
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
								iconUrl: get_vehicle_icon(vehicle.type),
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
											iconUrl: get_vehicle_icon(vehicle.type),
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
