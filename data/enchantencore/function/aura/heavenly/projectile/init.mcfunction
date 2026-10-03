tag @s add ee.heavenly_owner
execute as @n[type=#enchantencore:hard_projectiles,tag=!ee.heavenly_aura,tag=!ee.in_ground,distance=..10] if function enchantencore:aura/heavenly/projectile/is_owned run tag @s add ee.heavenly_aura
tag @s remove ee.heavenly_owner

execute as @e[type=#enchantencore:hard_projectiles,tag=ee.heavenly_aura,tag=!ee.in_ground] at @s run function enchantencore:aura/heavenly/projectile/particles
