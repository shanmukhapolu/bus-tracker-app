const CARMEL_HIGH_SCHOOL_LOGO =
  "https://i.postimg.cc/2yCQ9mD5/Carmel-High-School-Logo.webp";

export function SchoolLogo({
  className = "",
  alt = "Carmel High School",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <img
      className={className}
      src={CARMEL_HIGH_SCHOOL_LOGO}
      alt={alt}
      decoding="async"
    />
  );
}

export { CARMEL_HIGH_SCHOOL_LOGO };
