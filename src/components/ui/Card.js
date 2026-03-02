export default function Card({ children, className = "" }) {
  return (
    <div
  className={`bg-white border border-slate-200 rounded-2xl shadow-sm transition-all duration-200 hover:shadow-md ${className}`}
>
      {children}
    </div>
  )
}