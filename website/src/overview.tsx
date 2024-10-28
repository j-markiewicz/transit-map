import { useState } from "preact/hooks";

import style from "./overview.module.css";

export function Overview({ system }: { system: string }) {
	const [tab, setTab] = useState<"lines" | "stops" | "alerts">("lines");

	return (
		<>
			TODO: overview of {tab} for system {system}
		</>
	);
}
