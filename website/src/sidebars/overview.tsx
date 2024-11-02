import { VNode } from "preact";
import { useEffect, useState } from "preact/hooks";

import Loading from "../components/loading.tsx";
import Line from "../components/line.tsx";
import LineGroup from "../components/line-group.tsx";
import Stop from "../components/stop.tsx";
import StopGroup from "../components/stop-group.tsx";
import { get_alerts, get_lines, get_stops, VehicleType } from "../api.ts";
import { cmp } from "../util.ts";
import style from "./overview.module.css";
import Alert from "../components/alert.tsx";
import { Temporal } from "temporal-polyfill";

type Tab = "lines" | "stops" | "alerts";

export default function Overview({ system }: { system: string }) {
	const [tab, setTabInner] = useState<Tab>("lines");
	const [search, setSearch] = useState<string>("");
	const [content, setContent] = useState<
		VNode<unknown> | ((search: string) => VNode<unknown>)
	>(<Loading />);
	const setTab = (new_tab: Tab) => {
		if (tab !== new_tab) {
			setContent(<Loading />);
			setSearch("");
			setTabInner(new_tab);
		}
	};

	useEffect(() => {
		switch (tab) {
			case "lines":
				lines(system).then((l) => {
					if (tab === "lines") {
						setContent(() => l);
					}
				});
				break;
			case "stops":
				stops(system).then((s) => {
					if (tab === "stops") {
						setContent(() => s);
					}
				});
				break;
			case "alerts":
				alerts(system).then((a) => {
					if (tab === "alerts") {
						setContent(() => a);
					}
				});
				break;
		}
	}, [system, tab]);

	return (
		<>
			<h1 class={style.title}>{system}</h1>

			<div class={style.tabs}>
				<a
					class={`${style.tab} ${tab === "lines" ? style.current : ""}`}
					onClick={() => setTab("lines")}
				>
					Lines
				</a>
				<a
					class={`${style.tab} ${tab === "stops" ? style.current : ""}`}
					onClick={() => setTab("stops")}
				>
					Stops
				</a>
				<a
					class={`${style.tab} ${tab === "alerts" ? style.current : ""}`}
					onClick={() => setTab("alerts")}
				>
					Alerts
				</a>

				<div class={style.content}>
					{typeof content === "function" ? (
						<>
							<input
								type="text"
								class={style.search}
								placeholder="Search"
								onInput={(ev) => setSearch(ev.currentTarget.value)}
							/>

							{content(search)}
						</>
					) : (
						content
					)}
				</div>
			</div>
		</>
	);
}

async function lines(
	system: string
): Promise<(search: string) => VNode<unknown>> {
	const lines = (await get_lines(system)) ?? [];
	const groups = new Map<
		string,
		{
			group: {
				name: string;
				type: VehicleType;
			};
			lines: typeof lines;
		}
	>();

	for (const line of lines) {
		const group = groups.get(`${line.name} ${line.type}`);

		if (group === undefined) {
			groups.set(`${line.name} ${line.type}`, {
				group: {
					name: line.name,
					type: line.type,
				},
				lines: [line],
			});
		} else {
			group.lines.push(line);
		}
	}

	return (search: string) => (
		<>
			{[...groups.values()]
				.filter((v) => v.group.name.includes(search))
				.sort((a, b) => cmp([a.group.name], [b.group.name]))
				.map(({ group, lines }) => (
					<LineGroup key={group.name} name={group.name} type={group.type}>
						{lines
							.sort((a, b) => cmp([a.headsign], [b.headsign]))
							.map((l) => (
								<Line
									key={l.id}
									system={system}
									id={l.id}
									name={l.name}
									headsign={l.headsign}
									stops={l.stops.map((s) => s.name)}
								/>
							))}
					</LineGroup>
				))}
		</>
	);
}

async function stops(
	system: string
): Promise<(search: string) => VNode<unknown>> {
	const stops = (await get_stops(system)) ?? [];
	const groups = new Map<string, typeof stops>();

	for (const stop of stops) {
		const group = groups.get(stop.name);

		if (group === undefined) {
			groups.set(stop.name, [stop]);
		} else {
			group.push(stop);
		}
	}

	return (search: string) => (
		<>
			{[...groups.entries()]
				.filter(([k, _]) => k.includes(search))
				.sort(([a, _a], [b, _b]) => cmp([a], [b]))
				.map(([name, stops]) => (
					<StopGroup
						key={name}
						name={name}
						types={[...new Set(stops.flatMap((s) => s.types))].sort(
							(a, b) => a - b
						)}
					>
						{stops
							.sort((a, b) => cmp([a.id], [b.id]))
							.map((s) => (
								<Stop
									key={s.id}
									system={system}
									id={s.id}
									name={s.name}
									lines={s.lines}
								/>
							))}
					</StopGroup>
				))}
		</>
	);
}

async function alerts(system: string): Promise<VNode<unknown>> {
	const alerts = (await get_alerts(system)) ?? [];

	if (alerts.length === 0) {
		return <p class={style.noalerts}>No Alerts</p>;
	}

	return (
		<>
			{alerts.map((a) => (
				<Alert
					info={a.info}
					details={a.details}
					start={
						a.time === undefined || a.time[0] === null
							? undefined
							: Temporal.Instant.fromEpochSeconds(a.time[0])
					}
					end={
						a.time === undefined || a.time[1] === null
							? undefined
							: Temporal.Instant.fromEpochSeconds(a.time[1])
					}
				/>
			))}
		</>
	);
}
