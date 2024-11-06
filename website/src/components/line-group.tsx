import { ComponentChildren } from "preact";
import { useState } from "preact/hooks";

import expand_icon from "../assets/expand.svg";
import unexpand_icon from "../assets/unexpand.svg";

import { VehicleType } from "../api.ts";
import { get_type_name, get_vehicle_icon } from "../util.ts";
import style from "./line-group.module.css";

export default function LineGroup({
	name,
	type,
	children,
}: {
	name: string;
	type: VehicleType;
	children: ComponentChildren;
}) {
	const [expanded, setExpanded] = useState(false);

	return (
		<>
			<div class={style.group} onClick={() => setExpanded((e) => !e)}>
				<img
					class={style.icon}
					src={get_vehicle_icon(type)}
					alt={`${get_type_name(type)} line`}
				/>
				<span class={style.name}>{name}</span>

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
