import style from "./edit.module.css";

export function Edit({ system }: { system?: string }) {
	if (system !== undefined) {
		return <>TODO: edit {system}</>;
	} else {
		return <>TODO: add new system</>;
	}
}
