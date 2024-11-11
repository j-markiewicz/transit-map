import { navigate } from "wouter-preact/use-hash-location";
import { useContext, useEffect, useState } from "preact/hooks";

import back_icon from "../assets/back.svg";
import locate_icon from "../assets/locate.svg";
import refresh_icon from "../assets/refresh.svg";

import Loading from "../components/loading.tsx";
import { get_line } from "../api.ts";
import type { Line } from "../api.ts";
import { get_stop_icon, get_type_name } from "../util.ts";
import { MapCtx } from "../pages/map.tsx";
import style from "./line.module.css";

export default function Line({ system, id }: { system: string; id: string }) {
	const [refresh_counter, refresh_inner] = useState<number>(0);
	const refresh = () => (setSchedule(null), refresh_inner((c) => c + 1));
	const [schedule, setSchedule] = useState<Line | "error" | null>(null);
	const { map, highlighted, shapes } = useContext(MapCtx)!;
	useEffect(() => () => (highlighted.value = null), [system, id]);

	useEffect(() => {
		get_line(system, id).then((s) => {
			if (s === undefined) {
				setSchedule("error");
			} else {
				shapes.value = s.shape.map((sh) => [sh, s.color]);
				setSchedule(s);
			}
		});

		return () => (shapes.value = []);
	}, [system, id, refresh_counter]);

	if (schedule === "error") {
		return (
			<div class={style.header}>
				<a class={style.back} onClick={() => navigate(`/${system}`)}>
					<img class={style.backicon} src={back_icon} alt="go back" />
				</a>
				<h1 class={style.title}>Error</h1>
				<a class={style.refresh} onClick={() => refresh()}>
					<img class={style.refreshicon} src={refresh_icon} alt="refresh" />
				</a>
			</div>
		);
	}

	return (
		<div class={style.wrapper}>
			<div class={style.header}>
				<a class={style.back} onClick={() => navigate(`/${system}`)}>
					<img class={style.backicon} src={back_icon} alt="go back" />
				</a>
				<div class={style.title}>
					<h1 class={style.name}>{schedule === null ? "" : schedule?.name}</h1>
					<h2 class={style.headsign}>
						{schedule === null ? "" : schedule?.headsign}
					</h2>
				</div>
				<a
					class={style.locate}
					onClick={() =>
						schedule === null
							? null
							: map.flyToBounds(schedule.stops.map((s) => [s.lat, s.lon]))
					}
				>
					<img class={style.locateicon} src={locate_icon} alt="locate on map" />
				</a>
			</div>

			<div class={style.content}>
				{schedule === null ? (
					<Loading />
				) : (
					schedule.stops.map((s, i) => (
						<>
							{i === 0 ? null : <div class={style.gap}>&zwnj;</div>}

							<div
								class={style.stop}
								onClick={() => navigate(`/${system}/stop/${s.id}`)}
								onMouseLeave={() => (highlighted.value = null)}
								onMouseEnter={() => (highlighted.value = s.id)}
							>
								<img
									class={style.stopicon}
									src={get_stop_icon(schedule.type)}
									alt={`${get_type_name(schedule.type)} stop`}
								/>
								<span class={style.stopname}>{s.name}</span>
							</div>
						</>
					))
				)}
			</div>
		</div>
	);
}
