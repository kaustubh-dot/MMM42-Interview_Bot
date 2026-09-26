import { PracticeHub } from "@/components/pipeline/practice/practice-hub";
import { practiceCatalog } from "@/lib/practice/data";

// Server component: only the catalog (no reference solutions) is sent to the browser.
export default function PracticePage() {
  return <PracticeHub catalog={practiceCatalog()} />;
}
