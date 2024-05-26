execute at @s run data modify entity @n[type=bee,limit=1] AngerTime set value 600
execute at @s run data modify entity @n[type=bee,limit=1] AngryAt set from entity @s UUID
execute at @s run particle dust_pillar{block_state:"minecraft:honey_block"} ~ ~ ~ .2 .2 .2 0 50