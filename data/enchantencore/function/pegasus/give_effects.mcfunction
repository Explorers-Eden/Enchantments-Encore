$execute as @s[y=$(init_height),dy=30] at @s run effect give @n[type=#enchantencore:rideable] minecraft:levitation 1 1 true
$execute as @s[y=$(init_height),dy=30] at @s run effect give @n[type=#enchantencore:rideable] minecraft:speed 3 9 true

effect give @n[type=#enchantencore:rideable] minecraft:slow_falling 15 0 true
effect give @s minecraft:slow_falling 15 0 true
