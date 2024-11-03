import { Temporal } from "temporal-polyfill";

import { get_type_name, get_vehicle_icon } from "../util";
import { VehicleType } from "../api";
import style from "./scheduled-stop.module.css";

export default function ScheduledStop({
	now,
	onClick,
	stop: { line, type, name, headsign, arrival, departure, delay },
}: {
	now: Temporal.ZonedDateTime;
	onClick: () => void;
	stop: {
		line: string;
		type: VehicleType;
		name: string;
		headsign: string;
		arrival: Temporal.ZonedDateTime;
		departure: Temporal.ZonedDateTime;
		delay?: [number, number | undefined];
	};
}) {
	return (
		<div
			key={`${line}-${arrival.toString()}`}
			onClick={onClick}
			class={`${style.stop} ${
				arrival.since(now).sign === -1 ? style.past : style.future
			}`}
		>
			<p class={style.header}>
				<img
					class={style.icon}
					src={get_vehicle_icon(type)}
					alt={`${get_type_name(type)}`}
				/>
				<span class={style.name}>{name}</span>
				<span class={style.headsign}>{headsign}</span>
			</p>
			<p class={style.times}>
				{arrival.equals(departure) ? null : (
					<>
						<span class={style.arrival}>
							{arrival.toPlainTime().toLocaleString()}
						</span>
						<span>-</span>
					</>
				)}
				<span class={style.departure}>
					{departure.toPlainTime().toLocaleString()}
				</span>
				<span class={style.delay}>
					{delay?.[0] === undefined
						? "scheduled"
						: delay?.[0] === 0
						? "on time"
						: `${Math.abs(delay?.[0] / 60).toFixed(1)} min ${
								delay?.[0] >= 0 ? "late" : "early"
						  }`}
				</span>
			</p>
		</div>
	);
}
