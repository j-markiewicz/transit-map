import { navigate } from "wouter-preact/use-hash-location";
import { useEffect, useState } from "preact/hooks";
import { Temporal } from "temporal-polyfill";

import back_icon from "../assets/back.svg";
import refresh_icon from "../assets/refresh.svg";

import Loading from "../components/loading.tsx";
import ScheduledStop from "../components/scheduled-stop.tsx";
import { get_stop_schedule, StopSchedule } from "../api.ts";
import { cmp } from "../util.ts";
import style from "./stop.module.css";

export default function Stop({ system, id }: { system: string; id: string }) {
	const [refresh_counter, refresh_inner] = useState<number>(0);
	const refresh = () => (setSchedule(null), refresh_inner((c) => c + 1));
	const [schedule, setSchedule] = useState<StopSchedule | "error" | null>(null);
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
		let valid = true;
		setSchedule(null);
		get_stop_schedule(system, id).then((s) => {
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
			get_stop_schedule(system, id).then((s) => {
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

	const now = Temporal.Now.zonedDateTimeISO();

	return (
		<div class={style.wrapper}>
			<div class={style.header}>
				<a class={style.back} onClick={() => navigate(`/${system}`)}>
					<img class={style.backicon} src={back_icon} alt="go back" />
				</a>
				<h1 class={style.name}>{schedule === null ? "" : schedule?.name}</h1>
				<a class={style.refresh} onClick={() => refresh()}>
					<img class={style.refreshicon} src={refresh_icon} alt="refresh" />
				</a>
			</div>

			{schedule === null ? null : (
				<div class={style.lines}>
					{[...new Set(schedule.lines.map((l) => l.name))]
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
				) : (
					schedule.schedule
						.filter((s) => filter === null || filter === s.name)
						.map((s) => ({
							...s,
							arrival: Temporal.ZonedDateTime.from(s.arrival),
							departure: Temporal.ZonedDateTime.from(s.departure),
						}))
						.map((s, i, a) => (
							<>
								{i === 0 ||
								!a[i - 1].arrival
									.toPlainDate()
									.equals(s.arrival.toPlainDate()) ? (
									<p key={s.arrival.toString()} class={style.date}>
										{s.arrival.toPlainDate().toLocaleString()}
									</p>
								) : null}

								{(a[i - 1]?.arrival?.since(now)?.sign ??
									s.arrival.since(now).sign) !== s.arrival.since(now).sign ? (
									<hr id={style.now} />
								) : null}

								<ScheduledStop
									now={now}
									stop={s}
									onClick={() => navigate(`/${system}/line/${s.line}`)}
								/>
							</>
						))
				)}
			</div>
		</div>
	);
}
