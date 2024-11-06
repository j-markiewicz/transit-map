import { navigate } from "wouter-preact/use-hash-location";
import { useContext } from "preact/hooks";
import L from "leaflet";

import { MapCtx } from "../pages/map.tsx";
import { VehicleType } from "../api.ts";
import { cmp, get_type_name, get_vehicle_icon } from "../util.ts";
import style from "./stop.module.css";

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
	const { map, stops } = useContext(MapCtx)!;

	return (
		<div
			class={style.stop}
			onMouseEnter={() => {
				const zoom = Math.pow(map.getZoom() / 22, 3);
				stops[id]?.setIcon(
					L.icon({
						iconUrl: stops[id].getIcon().options.iconUrl!,
						iconSize: [2 * zoom * 48, 2 * zoom * 64],
					})
				);
			}}
			onMouseLeave={() => {
				const zoom = Math.pow(map.getZoom() / 22, 3);
				stops[id]?.setIcon(
					L.icon({
						iconUrl: stops[id].getIcon().options.iconUrl!,
						iconSize: [zoom * 48, zoom * 64],
					})
				);
			}}
		>
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
