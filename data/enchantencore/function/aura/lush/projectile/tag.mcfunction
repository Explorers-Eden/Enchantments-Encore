$execute as @n[type=#enchantencore:hard_projectiles,tag=!ee.lush_aura,tag=!ee.in_ground,distance=..10] if data entity @s {Owner:$(UUID)} run tag @s add ee.lush_aura