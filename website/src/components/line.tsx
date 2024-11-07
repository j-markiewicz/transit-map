import { navigate } from "wouter-preact/use-hash-location";
import { useContext, useEffect } from "preact/hooks";

import { MapCtx } from "../pages/map.tsx";
import style from "./line.module.css";

export default function Line({
	system,
	id,
	name,
	headsign,
	stops,
	shapes,
}: {
	system: string;
	id: string;
	name: string;
	headsign: string;
	stops: string[];
	shapes: [string, string | undefined][];
}) {
	const { shapes: map_shapes } = useContext(MapCtx)!;
	useEffect(() => () => (map_shapes.value = []), [system, id]);

	return (
		<div
			class={style.line}
			onClick={() => navigate(`/${system}/line/${id}`)}
			onMouseLeave={() => (map_shapes.value = [])}
			onMouseEnter={() => (map_shapes.value = shapes)}
		>
			<div class={style.header}>
				<span class={style.name}>{name}</span>
				<span class={style.headsign}>{headsign}</span>
			</div>
			<p class={style.stops}>{`Via ${stops.join(", ")}`}</p>
		</div>
	);
}
