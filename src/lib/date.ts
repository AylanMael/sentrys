import { format } from "date-fns";
import { fr } from "date-fns/locale";

export function formatFr(date: Date, pattern = "PPPP 'à' p") {
  return format(date, pattern, { locale: fr });
}
