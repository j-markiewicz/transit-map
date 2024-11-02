import style from "./loading.module.css";

export default function Loading() {
	return (
		<p class={style.loading}>
			Loading <span class={style.ellipsis}>.</span>
			<span class={style.ellipsis}>.</span>
			<span class={style.ellipsis}>.</span>
		</p>
	);
}
