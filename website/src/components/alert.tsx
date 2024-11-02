import { Temporal } from "temporal-polyfill";
import { useState } from "preact/hooks";

import expand_icon from "../assets/expand.svg";
import unexpand_icon from "../assets/unexpand.svg";

import style from "./alert.module.css";

export default function Alert({
	info,
	details,
}: {
	info: string;
	details: string;
	start?: Temporal.Instant;
	end?: Temporal.Instant;
}) {
	const [expanded, setExpanded] = useState(false);

	return (
		<div class={style.alert} onClick={() => setExpanded((e) => !e)}>
			<div class={style.header}>
				<p class={style.title}>{info}</p>

				{expanded ? (
					<img class={style.arrow} src={unexpand_icon} alt="" />
				) : (
					<img class={style.arrow} src={expand_icon} alt="" />
				)}
			</div>

			<p class={expanded ? style.longtext : style.shorttext}>{details}</p>
		</div>
	);
}
