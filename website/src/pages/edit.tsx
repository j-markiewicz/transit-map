import { useEffect, useRef, useState } from "preact/hooks";
import { navigate } from "wouter-preact/use-hash-location";
import L from "leaflet";

import layers from "../layers.json";
import Loading from "../components/loading.tsx";
import { get_config, SystemConfig } from "../api.ts";
import style from "./edit.module.css";

export default function Edit({ system }: { system?: string }) {
	const map_container = useRef(null);
	const [action, setAction] = useState<"view" | "edit" | "add">("view");
	const [config, setConfig] = useState<
		(SystemConfig & { name: string }) | "error" | null
	>(null);

	let map: L.Map | undefined;

	useEffect(() => {
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

		if (map_container.current !== null) {
			map = L.map(map_container.current, {
				center: [0, 0],
				zoom: 2,
				layers: [Object.values(maps)[0]],
				zoomControl: action !== "view",
			});

			L.control.layers(maps, overlays, { autoZIndex: false }).addTo(map);

			if (config !== "error" && config?.location !== undefined) {
				map.flyToBounds(config.location, { animate: false });
			}

			if (action === "view") {
				map.dragging.disable();
				map.keyboard.disable();
				map.boxZoom.disable();
				map.touchZoom.disable();
				map.doubleClickZoom.disable();
				map.scrollWheelZoom.disable();
				map.tapHold?.disable();
			}
		}

		return () => {
			map?.remove();
		};
	});

	if (system === undefined) {
		setAction("add");
		setConfig({
			name: "",
			location: [
				[90, -180],
				[-90, 180],
			],
			gtfs: {},
			realtime: {},
		});

		return <Loading />;
	}

	if (config === null) {
		useEffect(() => {
			get_config(system).then((c) => {
				if (c === undefined) {
					setConfig("error");
				} else {
					setConfig({ ...c, name: system });
					setAction(c.can_edit ? "edit" : "view");
				}
			});
		}, [system]);

		return <Loading />;
	}

	if (config === "error") {
		return (
			<div class={style.wrapper}>
				<h1 class={style.name}>Error</h1>
				<p class={style.error}>
					Check the spelling of the URL and refresh the page.
				</p>
			</div>
		);
	}

	return (
		<div class={style.wrapper}>
			<h1 class={style.title}>
				{action === "add"
					? "Add New System"
					: action === "edit"
					? "Edit System Config"
					: "View System Config"}
			</h1>

			<label class={style.name}>
				<h2 class={style.label}>Name</h2>
				<input
					type="text"
					class={style.input}
					placeholder="name"
					value={config.name}
					disabled={action !== "add"}
					onInput={(ev) =>
						setConfig({ ...config, name: ev.currentTarget.value })
					}
				/>
				<p class={style.sublabel}>
					A name to identify this transit system. Must be unique, at least 1
					character long, and can not start with a lowercase latin letter. Can
					not be edited in an existing system.
				</p>
			</label>

			<label class={style.location}>
				<h2 class={style.label}>Location</h2>
				<div ref={map_container} class={style.map}></div>
				<p class={style.sublabel}>
					Pan the map to the approximate location of the transit system. This
					location will be used as the initial position of the overview map.
				</p>
			</label>

			<div class={style.sources}>
				<h2 class={style.label}>Sources</h2>

				<ul class={style.sourcelist}>
					{Object.entries(config.gtfs).map(([url, gtfs]) => (
						<li key={url} class={style.source}>
							<div class={style.gtfssource}>
								<label class={style.sourcelabel}>
									<span>URL: </span>
									<div class={style.inputwrapper}>
										<input
											type="text"
											value={url}
											class={style.input}
											disabled={action === "view"}
											placeholder="GTFS Schedule source URL"
											title="GTFS Schedule source URL"
										/>
									</div>
								</label>

								<label class={style.smallsourcelabel}>
									<span>Max Age: </span>
									<div class={style.inputwrapper}>
										<input
											type="text"
											value={gtfs?.max_age ?? ""}
											class={`${style.input} ${style.smallinput}`}
											disabled={action === "view"}
											title="Maximum age of data from this source (e.g. '1d' or '8h')"
										/>
									</div>
								</label>
							</div>

							<ul class={style.rtsources}>
								{Object.entries(config.realtime).map(([url, rt]) =>
									rt?.id !== gtfs?.id ? null : (
										<li key={url} class={style.rtsource}>
											<label class={style.sourcelabel}>
												<span>URL: </span>
												<div class={style.inputwrapper}>
													<input
														type="text"
														value={url}
														class={style.input}
														disabled={action === "view"}
														placeholder="GTFS Realtime source URL"
														title="GTFS Realtime source URL"
													/>
												</div>
											</label>

											<label class={style.smallsourcelabel}>
												<span>Max Age: </span>
												<div class={style.inputwrapper}>
													<input
														type="text"
														value={rt?.max_age ?? ""}
														class={`${style.input} ${style.smallinput}`}
														disabled={action === "view"}
														title="Maximum age of data from this source (e.g. '10s' or '2m')"
													/>
												</div>
											</label>
										</li>
									)
								)}
							</ul>
						</li>
					))}
				</ul>
			</div>

			<div class={style.buttons}>
				<button
					class={style.button}
					title={action === "view" ? "Go back" : "Cancel editing and go back"}
					onClick={() =>
						action === "view" ||
						confirm(
							"Are you sure you want to cancel?\nAll edited/added data will be lost."
						)
							? navigate(`/`)
							: void 0
					}
				>
					{action === "view" ? "Back" : "Cancel"}
				</button>

				<button
					class={style.button}
					disabled={action === "view"}
					title={action === "view" ? "Can not save in view-only mode" : "Save"}
					onClick={() => navigate(`/`)}
				>
					{action === "add" ? "Add" : "Save"}
				</button>
			</div>
		</div>
	);
}
