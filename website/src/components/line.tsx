import { navigate } from "wouter-preact/use-hash-location";
import style from "./line.module.css";

export default function Line({
	system,
	id,
	name,
	headsign,
	stops,
}: {
	system: string;
	id: string;
	name: string;
	headsign: string;
	stops: string[];
}) {
	return (
		<div class={style.line} onClick={() => navigate(`/${system}/line/${id}`)}>
			<div class={style.header}>
				<span class={style.name}>{name}</span>
				<span class={style.headsign}>{headsign}</span>
			</div>
			<p class={style.stops}>{`Via ${stops.join(", ")}`}</p>
		</div>
	);
}
