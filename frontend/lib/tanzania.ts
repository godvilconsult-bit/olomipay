// All 31 regions of Tanzania (26 mainland + 5 Zanzibar) and their councils/districts.
export const TZ_DISTRICTS: Record<string, string[]> = {
  'Arusha':          ['Arusha City', 'Arusha', 'Karatu', 'Longido', 'Meru', 'Monduli', 'Ngorongoro'],
  'Dar es Salaam':   ['Ilala', 'Kinondoni', 'Temeke', 'Kigamboni', 'Ubungo'],
  'Dodoma':          ['Dodoma City', 'Bahi', 'Chamwino', 'Chemba', 'Kondoa', 'Kongwa', 'Mpwapwa'],
  'Geita':           ['Geita', 'Bukombe', 'Chato', 'Mbogwe', "Nyang'hwale"],
  'Iringa':          ['Iringa Municipal', 'Iringa', 'Kilolo', 'Mufindi'],
  'Kagera':          ['Bukoba Municipal', 'Bukoba', 'Biharamulo', 'Karagwe', 'Kyerwa', 'Missenyi', 'Muleba', 'Ngara'],
  'Katavi':          ['Mpanda', 'Mlele', 'Tanganyika', 'Nsimbo'],
  'Kigoma':          ['Kigoma-Ujiji', 'Kigoma', 'Buhigwe', 'Kakonko', 'Kasulu', 'Kibondo', 'Uvinza'],
  'Kilimanjaro':     ['Moshi Municipal', 'Moshi', 'Hai', 'Mwanga', 'Rombo', 'Same', 'Siha'],
  'Lindi':           ['Lindi Municipal', 'Lindi', 'Kilwa', 'Liwale', 'Nachingwea', 'Ruangwa'],
  'Manyara':         ['Babati Town', 'Babati', 'Hanang', 'Kiteto', 'Mbulu', 'Simanjiro'],
  'Mara':            ['Musoma Municipal', 'Musoma', 'Bunda', 'Butiama', 'Rorya', 'Serengeti', 'Tarime'],
  'Mbeya':           ['Mbeya City', 'Mbeya', 'Busokelo', 'Chunya', 'Kyela', 'Mbarali', 'Rungwe'],
  'Morogoro':        ['Morogoro Municipal', 'Morogoro', 'Gairo', 'Kilombero', 'Kilosa', 'Malinyi', 'Mvomero', 'Ulanga'],
  'Mtwara':          ['Mtwara Municipal', 'Mtwara', 'Masasi', 'Nanyumbu', 'Newala', 'Tandahimba'],
  'Mwanza':          ['Nyamagana', 'Ilemela', 'Buchosa', 'Kwimba', 'Magu', 'Misungwi', 'Sengerema', 'Ukerewe'],
  'Njombe':          ['Njombe Town', 'Njombe', 'Ludewa', 'Makambako', 'Makete', "Wanging'ombe"],
  'Pwani':           ['Kibaha Town', 'Kibaha', 'Bagamoyo', 'Chalinze', 'Kisarawe', 'Mafia', 'Mkuranga', 'Rufiji'],
  'Rukwa':           ['Sumbawanga Municipal', 'Sumbawanga', 'Kalambo', 'Nkasi'],
  'Ruvuma':          ['Songea Municipal', 'Songea', 'Madaba', 'Mbinga', 'Namtumbo', 'Nyasa', 'Tunduru'],
  'Shinyanga':       ['Shinyanga Municipal', 'Shinyanga', 'Kahama', 'Kishapu', 'Msalala', 'Ushetu'],
  'Simiyu':          ['Bariadi', 'Busega', 'Itilima', 'Maswa', 'Meatu'],
  'Singida':         ['Singida Municipal', 'Singida', 'Ikungi', 'Iramba', 'Manyoni', 'Mkalama'],
  'Songwe':          ['Mbozi', 'Ileje', 'Momba', 'Songwe', 'Tunduma'],
  'Tabora':          ['Tabora Municipal', 'Uyui', 'Igunga', 'Kaliua', 'Nzega', 'Sikonge', 'Urambo'],
  'Tanga':           ['Tanga City', 'Handeni', 'Kilindi', 'Korogwe', 'Lushoto', 'Muheza', 'Mkinga', 'Pangani'],
  'Kaskazini Unguja':['Kaskazini A', 'Kaskazini B'],
  'Kusini Unguja':   ['Kati', 'Kusini'],
  'Mjini Magharibi': ['Mjini', 'Magharibi A', 'Magharibi B'],
  'Kaskazini Pemba': ['Micheweni', 'Wete'],
  'Kusini Pemba':    ['Chake Chake', 'Mkoani'],
};

export const TZ_REGIONS = Object.keys(TZ_DISTRICTS);

/** Best-effort match of a free-text region (e.g. from geocoding) to a known region. */
export function matchRegion(raw?: string): string | null {
  if (!raw) return null;
  const r = raw.replace(/\s*region$/i, '').trim().toLowerCase();
  return TZ_REGIONS.find((x) => x.toLowerCase() === r) ?? TZ_REGIONS.find((x) => x.toLowerCase().includes(r) || r.includes(x.toLowerCase())) ?? null;
}
