import { navigate } from "wouter-preact/use-hash-location";
import style from "./stop.module.css";
import { VehicleType } from "../api";
import { cmp, get_type_name, get_vehicle_icon } from "../util";

export default function Stop({
	system,
	id,
	name,
	lines,
}: {
	system: string;
	id: string;
	name: string;
	lines: { id: string; name: string; headsign: string; type: VehicleType }[];
}) {
	return (
		<div class={style.stop}>
			<p class={style.name} onClick={() => navigate(`/${system}/stop/${id}`)}>
				{name}
			</p>
			<div class={style.lines}>
				{lines
					.sort((a, b) =>
						cmp([a.name, a.headsign, a.id], [b.name, b.headsign, b.id])
					)
					.map((l) => (
						<div
							class={style.line}
							title={`${l.name} ${l.headsign}`}
							onClick={() => navigate(`/${system}/line/${l.id}`)}
						>
							<img
								class={style.linetype}
								src={get_vehicle_icon(l.type)}
								alt={`${get_type_name(l.type)} line`}
							/>
							<span class={style.linename}>{l.name}</span>
							<span class={style.lineheadsign}>{l.headsign}</span>
						</div>
					))}
			</div>
		</div>
	);
}
