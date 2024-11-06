import {
	Component,
	ComponentChild,
	ComponentChildren,
	createContext,
	createRef,
} from "preact";
import { navigate } from "wouter-preact/use-hash-location";
import L from "leaflet";

import Loading from "../components/loading.tsx";
import { get_vehicles, get_stops, get_info, VehicleType } from "../api.ts";
import { get_stop_icon, get_vehicle_icon } from "../util.ts";
import layers from "../layers.json";
import style from "./map.module.css";
import "leaflet/dist/leaflet.css";
import "./map.css";

export const MapCtx = createContext<{
	map: L.Map;
	stops: { [id in string]?: L.Marker };
} | null>(null);

export default class Map extends Component<
	{
		children: ComponentChildren;
		system: string;
	},
	{ map_init: boolean }
> {
	private map: L.Map | undefined;
	private map_container = createRef<HTMLElement>();
	private stops: { [id in string]?: L.Marker } = {};
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
				<section class={style.sidebar}>
					{this.state.map_init ? (
						<MapCtx.Provider value={{ map: this.map!, stops: this.stops }}>
							{children}
						</MapCtx.Provider>
					) : (
						<Loading />
					)}
				</section>
				<section ref={this.map_container} class={style.map}></section>
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

		if (this.map_container.current === null) {
			return;
		}

		this.map = L.map(this.map_container.current, {
			center: [0, 0],
			zoom: 2,
			layers: [Object.values(maps)[0]],
			zoomControl: true,
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

		this.setState({ map_init: true });
	}

	private set_up_markers() {
		get_stops(this.props.system).then((stops) => {
			if (stops !== undefined && this.map !== undefined) {
				const map = this.map;
				const zoom = Math.pow(map.getZoom() / 22, 3);

				for (const stop of stops) {
					this.stops[stop.id] = L.marker([stop.lat, stop.lon], {
						title: `${stop.name} (${[...new Set(stop.lines.map((l) => l.name))]
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
						);
				}

				map.on("zoomend", () => {
					const zoom = Math.pow(map.getZoom() / 22, 3);

					for (const marker of Object.values(this.stops)) {
						marker?.setIcon(
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
