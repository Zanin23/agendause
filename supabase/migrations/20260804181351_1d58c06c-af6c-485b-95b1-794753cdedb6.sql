UPDATE public.trainings SET requires_acceptance = false;
UPDATE public.trainings SET requires_acceptance = true WHERE id IN (SELECT DISTINCT training_id FROM public.training_acceptances);
UPDATE public.trainings SET requires_acceptance = true WHERE id IN (SELECT DISTINCT training_id FROM public.guest_acceptances);