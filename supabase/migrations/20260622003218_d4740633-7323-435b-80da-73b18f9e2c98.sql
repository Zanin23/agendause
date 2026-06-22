
ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS training_id uuid REFERENCES public.trainings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS schedule_items_training_id_idx ON public.schedule_items(training_id);

CREATE OR REPLACE FUNCTION public.complete_schedule_items_for_training()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'concluido' AND (OLD.status IS DISTINCT FROM 'concluido') THEN
    UPDATE public.schedule_items
       SET status = 'done',
           done_date = COALESCE(done_date, CURRENT_DATE)
     WHERE training_id = NEW.id
       AND status <> 'done';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trainings_complete_schedule_items ON public.trainings;
CREATE TRIGGER trainings_complete_schedule_items
AFTER UPDATE OF status ON public.trainings
FOR EACH ROW EXECUTE FUNCTION public.complete_schedule_items_for_training();
