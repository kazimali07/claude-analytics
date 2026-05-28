export default function Project({ name, onBack }: { name: string; onBack: () => void }) {
  return <div className="p-8 text-[#94a3b8]">Project: {name} — coming in Task 13 <button onClick={onBack}>Back</button></div>;
}
