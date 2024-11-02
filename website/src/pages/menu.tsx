import { useEffect, useState } from "preact/hooks";
import { navigate } from "wouter-preact/use-hash-location";

import edit_icon from "../assets/edit.svg";

import Loading from "../components/loading.tsx";
import { BasicSystemInfo, get_all_info } from "../api.ts";
import style from "./menu.module.css";

export default function Menu() {
	const [info, setInfo] = useState<BasicSystemInfo[] | null>(null);

	useEffect(() => {
		get_all_info().then((i) => {
			setInfo(() => i ?? []);
		});
	}, []);

	return (
		<div class={style.wrapper}>
			{info === null ? (
				<Loading />
			) : (
				info.map((i) => (
					<>
						<section key={i.name} class={style.system}>
							<div class={style.header}>
								<a onClick={() => navigate(`/${i.name}`)} class={style.name}>
									<h1>{i.name}</h1>
								</a>

								<div class={style.buttons}>
									<a
										class={style.buttonwrapper}
										onClick={() => navigate(`/edit/${i.name}`)}
									>
										<img
											class={style.button}
											src={edit_icon}
											alt={`edit ${i.name}`}
										/>
									</a>
								</div>
							</div>

							<div class={style.chips}>
								<span class={style.chip}>
									{fmt_num(i.stops, { one: "stop", other: "stops" })}
								</span>
								<span class={style.chip}>
									{fmt_num(i.lines, { one: "line", other: "lines" })}
								</span>
								<span
									class={i.gtfs_sources === 0 ? style.emptychip : style.chip}
								>
									{i.gtfs_sources === 0
										? "No Schedule"
										: `Schedule ×${i.gtfs_sources}`}
								</span>
								<span class={i.rt_sources === 0 ? style.emptychip : style.chip}>
									{i.rt_sources === 0
										? "No Realtime"
										: `Realtime ×${i.rt_sources}`}
								</span>
							</div>
						</section>
					</>
				))
			)}
		</div>
	);
}

function fmt_num(
	n: number | undefined,
	word: {
		zero?: string;
		one?: string;
		two?: string;
		few?: string;
		many?: string;
		other?: string;
	}
): string {
	const plurals = new Intl.PluralRules("en");

	if (n === undefined || !isFinite(n)) {
		return `??? ${word[plurals.select(1000)]}`;
	} else if (n === 0) {
		return `No ${word[plurals.select(n)]}`;
	} else {
		return `${n} ${word[plurals.select(n)]}`;
	}
}
