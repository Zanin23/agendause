import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-2",
        month: "flex flex-col gap-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        nav: "flex items-center gap-1",
        nav_button: cn(buttonVariants({ variant: "outline" }), "h-7 w-7 bg-transparent p-0"),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse",
        head_row: "flex",
        head_cell: "text-muted-foreground rounded-md w-9 font-normal text-xs",
        row: "flex w-full mt-2",
        cell: "relative h-9 w-9 text-center text-sm",
        day: cn(buttonVariants({ variant: "ghost" }), "h-9 w-9 p-0 font-normal"),
        day_selected: "bg-primary text-primary-foreground hover:bg-primary",
        day_today: "ring-1 ring-primary",
        day_outside: "text-muted-foreground opacity-50",
        day_disabled: "text-muted-foreground opacity-50",
        ...classNames,
      }}
      components={{
        IconLeft: () => <ChevronLeft className="h-4 w-4" />,
        IconRight: () => <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";
export { Calendar };