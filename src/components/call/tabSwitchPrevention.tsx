import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import React, { useEffect, useState } from "react";

const useTabSwitchPrevention = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsDialogOpen(true);
        setTabSwitchCount((prev) => prev + 1);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const handleUnderstand = () => {
    setIsDialogOpen(false);
  };

  return { isDialogOpen, tabSwitchCount, handleUnderstand };
};

// Controlled by the caller's single hook instance. It used to call useTabSwitchPrevention()
// itself, which created a second listener whose count disagreed with the stored one.
function TabSwitchWarning({ open, onUnderstand }: { open: boolean; onUnderstand: () => void }) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>You left the interview tab</AlertDialogTitle>
          <AlertDialogDescription>
            Tab switches are noted for a person to review. Nothing is blocked, and it does not
            change your scores.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            className="bg-indigo-400 hover:bg-indigo-600 text-white"
            onClick={onUnderstand}
          >
            I understand
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { TabSwitchWarning, useTabSwitchPrevention };
