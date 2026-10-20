export default function PageHeading({ label, title, description }: { label: string; title: string; description: string }) {
  return <div className="grid gap-4 md:grid-cols-[210px_1fr]">
    <p className="pt-2.5 font-mono text-[10px] uppercase tracking-[1px] text-[#747470]">{label}</p>
    <div><h1 className="text-[clamp(36px,4vw,56px)] leading-none tracking-[-0.055em]">{title}</h1>
    <p className="mt-[17px] text-[13px] leading-5 text-[#747470]">{description}</p></div>
  </div>;
}
