$execute as @s[y=$(init_height),dy=30] at @s run effect give @s minecraft:levitation 1 1 true
$execute as @s[y=$(init_height),dy=30] at @s run effect give @s minecraft:speed 3 9 true

effect give @n[type=player] minecraft:slow_falling 15 0 true
effect give @s minecraft:slow_falling 15 0 true
