/** Le immagini importate nel codice vengono incorporate da esbuild come data URL. */
declare module '*.png' {
  const url: string;
  export default url;
}
