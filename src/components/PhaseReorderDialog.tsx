import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GripVertical, ListOrdered } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";

type Phase = {
  id: string;
  title: string;
  position: number;
};

interface PhaseReorderDialogProps {
  phases: Phase[];
  onReorder: (newPhases: Phase[]) => void;
}

export function PhaseReorderDialog({ phases, onReorder }: PhaseReorderDialogProps) {
  const [items, setItems] = React.useState(phases);

  React.useEffect(() => {
    setItems(phases);
  }, [phases]);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const newItems = Array.from(items);
    const [reorderedItem] = newItems.splice(result.source.index, 1);
    newItems.splice(result.destination.index, 0, reorderedItem);

    const updatedItems = newItems.map((item, index) => ({
      ...item,
      position: index,
    }));

    setItems(updatedItems);
    onReorder(updatedItems);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Reordenar fases">
          <ListOrdered className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Reordenar Fases</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="phases">
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="space-y-2"
                >
                  {items.map((phase, index) => (
                    <Draggable key={phase.id} draggableId={phase.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          style={provided.draggableProps.style as React.CSSProperties}
                          className={`flex items-center gap-3 p-3 rounded-lg border bg-card transition-shadow ${
                            snapshot.isDragging ? "shadow-lg border-primary" : "border-border"
                          }`}
                        >
                          <div {...provided.dragHandleProps} className="text-muted-foreground">
                            <GripVertical className="h-4 w-4" />
                          </div>
                          <span className="text-xs font-mono text-muted-foreground shrink-0">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span className="text-sm font-medium truncate">{phase.title}</span>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      </DialogContent>
    </Dialog>
  );
}
