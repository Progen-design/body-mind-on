export default function LayoutSection({ title, children }) {
  return (
    <section className="max-w-6xl mx-auto px-6 py-16">
      <h2 className="text-4xl md:text-5xl font-extrabold mb-10 bg-gradient-to-r from-[#7DF9FF] to-[#00FF87] bg-clip-text text-transparent text-center">
        {title}
      </h2>
      <div className="text-gray-300 text-lg leading-relaxed text-center max-w-3xl mx-auto">
        {children}
      </div>
    </section>
  );
}
