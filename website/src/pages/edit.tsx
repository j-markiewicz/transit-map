import { useEffect, useRef, useState } from "preact/hooks";
import { navigate } from "wouter-preact/use-hash-location";
import L from "leaflet";

import add_icon from "../assets/add.svg";
import delete_icon from "../assets/delete.svg";

import layers from "../layers.json";
import Loading from "../components/loading.tsx";
import {
	delete_config,
	get_config,
	LatLon,
	post_config,
	put_config,
} from "../api.ts";
import style from "./edit.module.css";

export default function Edit({ system }: { system?: string }) {
	const map_container = useRef(null);
	const [action, setAction] = useState<"view" | "edit" | "add">("view");
	const [config, setConfig] = useState<
		| {
				name: string;
				location: [LatLon, LatLon];
				gtfs: [
					string,
					{
						id: string;
						max_age: string;
					}
				][];
				realtime: [
					string,
					{
						id: string;
						max_age: string;
					}
				][];
		  }
		| "error"
		| null
	>(null);

	let map: L.Map | undefined;

	if (system === undefined && config === null) {
		setAction("add");
		setConfig({
			name: "",
			location: [
				[90, -180],
				[-90, 180],
			],
			gtfs: [],
			realtime: [],
		});

		return <Loading />;
	}

	if (config === null) {
		useEffect(() => {
			get_config(system ?? "").then((c) => {
				if (c === undefined) {
					setConfig("error");
				} else {
					setConfig({
						name: system ?? "",
						location: c.location,
						gtfs: Object.entries(c.gtfs)
							.filter(([_, v]) => v !== undefined)
							.map(([k, v]) => [k, v!]),
						realtime: Object.entries(c.realtime)
							.filter(([_, v]) => v !== undefined)
							.map(([k, v]) => [k, v!]),
					});
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

			if (config?.location !== undefined) {
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

			const m = map;
			map.on("moveend", () =>
				setConfig((c) =>
					c !== "error" && c !== null
						? {
								...c,
								location: [
									[
										m.getBounds().getNorthEast().lat,
										m.getBounds().getNorthEast().lng,
									],
									[
										m.getBounds().getSouthWest().lat,
										m.getBounds().getSouthWest().lng,
									],
								],
						  }
						: c
				)
			);
		}

		return () => {
			map?.remove();
		};
	}, [system, action, typeof config]);

	return (
		<>
			<header class={style.pageheader}>
				<a
					class={style.pagename}
					onClick={() =>
						action === "view" ||
						confirm(
							"Are you sure you want to cancel?\nAll edited/added data will be lost."
						)
							? navigate(`/`)
							: void 0
					}
				>
					<img class={style.pageicon} src="icon.svg" alt="transit-map logo" />
					Transit Map
				</a>
			</header>

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
						{config.gtfs.map(([url, gtfs], i) => (
							<li class={style.source}>
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
												onInput={(ev) => {
													setConfig({
														...config,
														gtfs: config.gtfs.map((c, k) =>
															i === k ? [ev.currentTarget.value, c[1]] : c
														),
													});
												}}
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
												onInput={(ev) => {
													setConfig({
														...config,
														gtfs: config.gtfs.map((c, k) =>
															i === k
																? [
																		c[0],
																		{
																			...c[1],
																			max_age: ev.currentTarget.value,
																		},
																  ]
																: c
														),
													});
												}}
											/>
										</div>
									</label>

									{action === "view" ? null : (
										<img
											src={delete_icon}
											class={style.deleteicon}
											alt="Delete source"
											title="Delete source"
											role="button"
											onClick={() =>
												setConfig({
													...config,
													gtfs: config.gtfs.filter((_, k) => k !== i),
													realtime: config.realtime.filter(
														(s) => s[1].id !== gtfs.id
													),
												})
											}
										/>
									)}
								</div>

								<ul class={style.rtsources}>
									{config.realtime.map(([url, rt], j) =>
										rt?.id !== gtfs?.id ? null : (
											<li class={style.rtsource}>
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
															onInput={(ev) => {
																setConfig({
																	...config,
																	realtime: config.realtime.map((c, k) =>
																		j === k ? [ev.currentTarget.value, c[1]] : c
																	),
																});
															}}
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
															onInput={(ev) => {
																setConfig({
																	...config,
																	realtime: config.realtime.map((c, k) =>
																		j === k
																			? [
																					c[0],
																					{
																						...c[1],
																						max_age: ev.currentTarget.value,
																					},
																			  ]
																			: c
																	),
																});
															}}
														/>
													</div>
												</label>

												{action === "view" ? null : (
													<img
														src={delete_icon}
														class={style.deleteicon}
														alt="Delete source"
														title="Delete source"
														role="button"
														onClick={() =>
															setConfig({
																...config,
																realtime: config.realtime.filter(
																	(_, k) => k !== j
																),
															})
														}
													/>
												)}
											</li>
										)
									)}

									{action === "view" ? null : (
										<li>
											<a
												class={style.addsource}
												onClick={() =>
													setConfig({
														...config,
														realtime: [
															...config.realtime,
															[
																"",
																{
																	id: gtfs?.id ?? "",
																	max_age: "1m",
																},
															],
														],
													})
												}
											>
												&zwnj;
												<img
													class={style.addicon}
													src={add_icon}
													alt="add source"
												/>
												Add GTFS Realtime source
											</a>
										</li>
									)}
								</ul>
							</li>
						))}

						{action === "view" ? null : (
							<li>
								<a
									class={style.addsource}
									onClick={() =>
										setConfig({
											...config,
											gtfs: [
												...config.gtfs,
												[
													"",
													{
														id: Object.keys(config.gtfs).length.toString(),
														max_age: "1d",
													},
												],
											],
										})
									}
								>
									&zwnj;
									<img class={style.addicon} src={add_icon} alt="add source" />
									Add GTFS Schedule source
								</a>
							</li>
						)}
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

					{action === "edit" && system !== undefined ? (
						<button
							class={style.button}
							title={"Delete this configuration permanently"}
							onClick={() =>
								confirm(
									"Are you sure you want to delete?\nAll configuration for this transit system will be lost."
								)
									? delete_config(system).then((success) => {
											if (success === false) {
												alert(
													"Couldn't delete transit system configuration.\nTry logging in again."
												);
											} else if (success === undefined) {
												alert(
													"Error deleting transit system configuration.\nTry logging in again."
												);
											}

											navigate(`/`);
									  })
									: void 0
							}
						>
							Delete
						</button>
					) : null}

					<button
						class={style.button}
						disabled={action === "view"}
						title={
							action === "view" ? "Can not save in view-only mode" : "Save"
						}
						onClick={() => {
							if (action === "view") {
								navigate("/");
							} else if (action === "edit" && system !== undefined) {
								put_config(system, {
									location: config.location,
									gtfs: Object.fromEntries(config.gtfs),
									realtime: Object.fromEntries(config.realtime),
								}).then((success) => {
									if (success === true) {
										navigate("/");
									} else {
										alert(
											"Error saving config\nMake sure the transit system exists and try logging in again"
										);
										navigate("/");
									}
								});
							} else if (action === "add") {
								post_config({
									name: config.name,
									location: config.location,
									gtfs: Object.fromEntries(config.gtfs),
									realtime: Object.fromEntries(config.realtime),
								}).then((success) => {
									if (success === true) {
										navigate("/");
									} else {
										alert(
											"Error saving config\nMake sure the transit system doesn't already exist and try logging in again"
										);
										navigate("/");
									}
								});
							}
						}}
					>
						{action === "add" ? "Add" : "Save"}
					</button>
				</div>
			</div>
		</>
	);
}
