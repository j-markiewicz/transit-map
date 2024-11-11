import { navigate } from "wouter-preact/use-hash-location";
import { useContext, useEffect, useState } from "preact/hooks";
import { Temporal } from "temporal-polyfill";

import back_icon from "../assets/back.svg";
import refresh_icon from "../assets/refresh.svg";
import locate_icon from "../assets/locate.svg";

import Loading from "../components/loading.tsx";
import ScheduledStop from "../components/scheduled-stop.tsx";
import { MapCtx } from "../pages/map.tsx";
import { get_stop, StopSchedule } from "../api.ts";
import { cmp } from "../util.ts";
import style from "./stop.module.css";

export default function Stop({ system, id }: { system: string; id: string }) {
	const { map, highlighted } = useContext(MapCtx)!;
	const [refresh_counter, refresh_inner] = useState<number>(0);
	const refresh = () => (setSchedule(null), refresh_inner((c) => c + 1));
	const [schedule, setSchedule] = useState<StopSchedule | "error" | null>(null);
	const [tab, setTabInner] = useState<"arrivals" | "schedule">("arrivals");
	const setTab = (tab: "arrivals" | "schedule") => {
		if (tab === "arrivals") {
			setTimeout(() => {
				document
					.getElementById(style.now)
					?.previousElementSibling?.previousElementSibling?.scrollIntoView({
						behavior: "instant",
						block: "start",
					});
			}, 50);
		} else {
			setTimeout(() => {
				document.getElementsByClassName(style.content)[0]?.scroll({
					top: 0,
					behavior: "instant",
				});
			}, 50);
		}

		setTabInner(tab);
	};
	const [filter, setFilterInner] = useState<string | null>(null);
	const setFilter = (line: string) => {
		setTimeout(() => {
			document
				.getElementById(style.now)
				?.previousElementSibling?.previousElementSibling?.scrollIntoView({
					behavior: "instant",
					block: "start",
				});
		}, 50);

		setFilterInner((f) => (f === line ? null : line));
	};

	useEffect(() => {
		highlighted.value = id;
		return () => (highlighted.value = null);
	}, [system, id]);

	useEffect(() => {
		let valid = true;
		setSchedule(null);
		get_stop(system, id).then((s) => {
			if (s === undefined) {
				setSchedule("error");
				return;
			} else if (!valid) {
				return;
			} else {
				setSchedule(s);
				setTimeout(() => {
					document
						.getElementById(style.now)
						?.previousElementSibling?.previousElementSibling?.scrollIntoView({
							behavior: "smooth",
							block: "start",
						});
				}, 50);
			}
		});

		const int = setInterval(() => {
			get_stop(system, id).then((s) => {
				if (s !== undefined) {
					setSchedule(s);
				}
			});
		}, 10000);

		return () => {
			valid = false;
			clearInterval(int);
		};
	}, [system, id, refresh_counter]);

	if (schedule === "error") {
		return (
			<>
				<div class={style.header}>
					<a class={style.back} onClick={() => navigate(`/${system}`)}>
						<img class={style.backicon} src={back_icon} alt="go back" />
					</a>
					<h1 class={style.title}>Error</h1>
					<a class={style.refresh} onClick={() => refresh()}>
						<img class={style.refreshicon} src={refresh_icon} alt="refresh" />
					</a>
				</div>
			</>
		);
	}

	return (
		<div class={style.wrapper}>
			<div class={style.header}>
				<a class={style.back} onClick={() => navigate(`/${system}`)}>
					<img class={style.backicon} src={back_icon} alt="go back" />
				</a>
				<h1 class={style.name}>{schedule === null ? "" : schedule?.name}</h1>
				<a
					class={style.locate}
					onClick={() =>
						schedule === null
							? null
							: map.flyTo(
									[schedule.lat, schedule.lon],
									Math.max(map.getZoom(), 16)
							  )
					}
				>
					<img class={style.locateicon} src={locate_icon} alt="locate on map" />
				</a>
			</div>

			<div class={style.tabs}>
				<a
					class={`${style.tab} ${tab === "arrivals" ? style.current : ""}`}
					onClick={() => setTab("arrivals")}
				>
					Arrivals
				</a>
				<a
					class={`${style.tab} ${tab === "schedule" ? style.current : ""}`}
					onClick={() => setTab("schedule")}
				>
					Schedule
				</a>

				{schedule === null ? null : (
					<div class={style.lines}>
						{[...new Set(Object.values(schedule.lines).map((l) => l!.name))]
							.sort((a, b) => cmp([a], [b]))
							.map((l) => (
								<span
									class={`${style.line} ${
										filter === l
											? style.selectedline
											: filter !== null
											? style.nonselectedline
											: ""
									}`}
									onClick={() => setFilter(l)}
								>
									{l}
								</span>
							))}
					</div>
				)}

				<div class={style.content}>
					{schedule === null ? (
						<Loading />
					) : tab === "arrivals" ? (
						arrivals_content(schedule, filter, system)
					) : (
						schedule_content(schedule, filter)
					)}
				</div>
			</div>
		</div>
	);
}

function arrivals_content(
	schedule: StopSchedule,
	filter: string | null,
	system: string
) {
	const now = Temporal.Now.zonedDateTimeISO();

	return schedule.arrivals
		.filter((a) => filter === null || filter === schedule.lines[a.line]?.name)
		.map((a) => ({
			...a,
			arrival: Temporal.ZonedDateTime.from(a.arrival),
			departure: Temporal.ZonedDateTime.from(a.departure),
		}))
		.map((v, i, a) => (
			<>
				{i === 0 ||
				!a[i - 1].arrival.toPlainDate().equals(v.arrival.toPlainDate()) ? (
					<p key={v.arrival.toString()} class={style.date}>
						{v.arrival.toPlainDate().toLocaleString()}
					</p>
				) : null}

				{(a[i - 1]?.arrival?.since(now)?.sign ?? v.arrival.since(now).sign) !==
				v.arrival.since(now).sign ? (
					<hr id={style.now} />
				) : null}

				<ScheduledStop
					now={now}
					key={`${v.line}-${v.arrival}-${v.departure}`}
					stop={{ ...schedule.lines[v.line]!, ...v }}
					onClick={() => navigate(`/${system}/line/${v.line}`)}
				/>
			</>
		));
}

function schedule_content(schedule: StopSchedule, filter: string | null) {
	const named_schedule: {
		[name in string]?: {
			id: string;
			schedule: (typeof schedule.schedule.schedule)[string];
		};
	} = {};

	for (const [k, v] of Object.entries(schedule.schedule.schedule)) {
		const name = schedule.lines[k]?.name;

		if (name === undefined || v === undefined) {
			continue;
		}

		if (named_schedule[name] === undefined) {
			named_schedule[name] = { id: k, schedule: v };
		} else {
			Object.entries(named_schedule[name].schedule!).forEach(([k, s]) =>
				s.push(...v[k as keyof typeof v])
			);
		}
	}

	for (const s of Object.values(named_schedule)) {
		const cmp = (a: [string, string], b: [string, string]): number =>
			Temporal.PlainTime.from(a[0]).since(b[0]).total("second");

		s?.schedule?.monday?.sort(cmp);
		s?.schedule?.tuesday?.sort(cmp);
		s?.schedule?.wednesday?.sort(cmp);
		s?.schedule?.thursday?.sort(cmp);
		s?.schedule?.friday?.sort(cmp);
		s?.schedule?.saturday?.sort(cmp);
		s?.schedule?.sunday?.sort(cmp);
	}

	return (
		<>
			{(
				Object.entries(named_schedule)
					.filter(([n, _]) => filter === null || filter === n)
					.filter(([_, s]) => s !== undefined) as [
					string,
					{
						id: string;
						schedule: (typeof schedule.schedule.schedule)[string];
					}
				][]
			).map(([line, s]) => (
				<div key={line} class={style.schedulewrapper}>
					<h2 class={style.scheduleheader}>{line}</h2>
					<div class={style.scheduletable}>
						<table>
							<thead>
								<tr>
									<th scope="col"></th>
									<th scope="col">MON</th>
									<th scope="col">TUE</th>
									<th scope="col">WED</th>
									<th scope="col">THU</th>
									<th scope="col">FRI</th>
									<th scope="col">SAT</th>
									<th scope="col">SUN</th>
								</tr>
							</thead>
							<tbody>
								{[...range(24)].map((h) => (
									<tr>
										<th scope="row">{h.toFixed(0).padStart(2, "0")}</th>
										{[
											"monday",
											"tuesday",
											"wednesday",
											"thursday",
											"friday",
											"saturday",
											"sunday",
										].map((d) => (
											<td>
												{s.schedule?.[d as keyof typeof s.schedule]
													?.map((t) => Temporal.PlainTime.from(t[0]))
													.filter((t) => t.hour === h)
													.map((t) => (
														<span>{t.minute.toFixed(0).padStart(2, "0")}</span>
													))}
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			))}

			<h3 class={style.noteheading}>Note</h3>
			<p class={style.note}>
				There may be additional service at this stop on the following dates:{" "}
				{schedule.schedule.additional
					.map((d) => Temporal.PlainDate.from(d).toLocaleString())
					.join(", ")}
				. Please check the arrivals tab for details.
			</p>
			<p class={style.note}>
				Service at this stop may be removed or reduced on the following dates:{" "}
				{schedule.schedule.additional
					.map((d) => Temporal.PlainDate.from(d).toLocaleString())
					.join(", ")}
				. Please check the arrivals tab for details.
			</p>
			<p class={style.note}>
				The above schedules show all scheduled stops at this stop, including
				scheduled stops that are part of time-limited services. As a result, the
				above schedules may appear to show too many scheduled stops. Please
				check the arrivals tab for details.
			</p>
		</>
	);
}

function* range(a: number, b?: number) {
	const from = b === undefined ? 0 : a;
	const to = b === undefined ? a : b;

	for (let i = from; i < to; i++) {
		yield i;
	}
}
