-- Primeiro, desabilita temporariamente o trigger ou restrições se necessário (não costuma ser o caso para updates simples)
-- Define todos como 'false'
UPDATE public.trainings SET requires_acceptance = false;

-- Define como 'true' apenas os que têm aceite em training_acceptances
UPDATE public.trainings 
SET requires_acceptance = true 
WHERE id IN (SELECT DISTINCT training_id FROM public.training_acceptances);

-- Define como 'true' os que têm aceite em guest_acceptances
UPDATE public.trainings 
SET requires_acceptance = true 
WHERE id IN (SELECT DISTINCT training_id FROM public.guest_acceptances);
