tag @s add ee.heavenly_owner
execute as @e[type=#enchantencore:pets] at @s unless predicate enchantencore:entity/is_idle if function enchantencore:aura/heavenly/pet/is_owned anchored eyes run function enchantencore:aura/heavenly/pet/particle
tag @s remove ee.heavenly_owner
