"use client"

export default function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}) {

  const base =
    "px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"

  const variants = {
    primary:
      "bg-blue-800 text-white hover:bg-blue-900",

    secondary:
      "bg-slate-100 text-slate-800 hover:bg-slate-200",

    danger:
      "bg-red-600 text-white hover:bg-red-700",

    success:
      "bg-emerald-600 text-white hover:bg-emerald-700",

    ghost:
      "text-slate-700 hover:bg-slate-100"
  }

  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}