import { ComponentChildren } from "preact";
import { useState } from "preact/hooks";

import expand_icon from "../assets/expand.svg";
import unexpand_icon from "../assets/unexpand.svg";

import { VehicleType } from "../api.ts";
import { get_stop_icon, get_type_name } from "../util.ts";
import style from "./stop-group.module.css";

export default function StopGroup({
	name,
	types,
	children,
}: {
	name: string;
	types: VehicleType[];
	children: ComponentChildren;
}) {
	const [expanded, setExpanded] = useState(false);

	return (
		<>
			<div class={style.group} onClick={() => setExpanded((e) => !e)}>
				<div class={style.header}>
					{types.map((type) => (
						<img
							class={style.icon}
							src={get_stop_icon(type)}
							alt={`${get_type_name(type)} stop`}
						/>
					))}
					<span class={style.name}>{name}</span>
				</div>

				{expanded ? (
					<img class={style.arrow} src={unexpand_icon} alt="" />
				) : (
					<img class={style.arrow} src={expand_icon} alt="" />
				)}
			</div>

			{expanded ? children : null}
		</>
	);
}
