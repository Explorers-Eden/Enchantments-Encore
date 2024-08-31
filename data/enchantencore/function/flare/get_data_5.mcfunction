execute store result storage enchantencore:flare colors_1 int 1 run random value 0..16777215
execute store result storage enchantencore:flare fade_colors_1 int 1 run random value 0..16777215

execute store result storage enchantencore:flare colors_2 int 1 run random value 0..16777215
execute store result storage enchantencore:flare fade_colors_2 int 1 run random value 0..16777215

execute store result storage enchantencore:flare colors_3 int 1 run random value 0..16777215
execute store result storage enchantencore:flare fade_colors_3 int 1 run random value 0..16777215

execute store result storage enchantencore:flare colors_4 int 1 run random value 0..16777215
execute store result storage enchantencore:flare fade_colors_4 int 1 run random value 0..16777215

execute store result storage enchantencore:flare colors_5 int 1 run random value 0..16777215
execute store result storage enchantencore:flare fade_colors_5 int 1 run random value 0..16777215

execute store result score $enchantencore_firework_shape enchantencore.technical run random value 1..5
execute if score $enchantencore_firework_shape enchantencore.technical matches 1 run data modify storage enchantencore:flare shape set value 'small_ball'
execute if score $enchantencore_firework_shape enchantencore.technical matches 2 run data modify storage enchantencore:flare shape set value 'large_ball'
execute if score $enchantencore_firework_shape enchantencore.technical matches 3 run data modify storage enchantencore:flare shape set value 'star'
execute if score $enchantencore_firework_shape enchantencore.technical matches 4 run data modify storage enchantencore:flare shape set value 'creeper'
execute if score $enchantencore_firework_shape enchantencore.technical matches 5 run data modify storage enchantencore:flare shape set value 'burst'

execute store result score $enchantencore_firework_shape_2 enchantencore.technical run random value 1..5
execute if score $enchantencore_firework_shape_2 enchantencore.technical matches 1 run data modify storage enchantencore:flare shape_2 set value 'small_ball'
execute if score $enchantencore_firework_shape_2 enchantencore.technical matches 2 run data modify storage enchantencore:flare shape_2 set value 'large_ball'
execute if score $enchantencore_firework_shape_2 enchantencore.technical matches 3 run data modify storage enchantencore:flare shape_2 set value 'star'
execute if score $enchantencore_firework_shape_2 enchantencore.technical matches 4 run data modify storage enchantencore:flare shape_2 set value 'creeper'
execute if score $enchantencore_firework_shape_2 enchantencore.technical matches 5 run data modify storage enchantencore:flare shape_2 set value 'burst'

execute store result score $enchantencore_firework_shape_3 enchantencore.technical run random value 1..5
execute if score $enchantencore_firework_shape_3 enchantencore.technical matches 1 run data modify storage enchantencore:flare shape_3 set value 'small_ball'
execute if score $enchantencore_firework_shape_3 enchantencore.technical matches 2 run data modify storage enchantencore:flare shape_3 set value 'large_ball'
execute if score $enchantencore_firework_shape_3 enchantencore.technical matches 3 run data modify storage enchantencore:flare shape_3 set value 'star'
execute if score $enchantencore_firework_shape_3 enchantencore.technical matches 4 run data modify storage enchantencore:flare shape_3 set value 'creeper'
execute if score $enchantencore_firework_shape_3 enchantencore.technical matches 5 run data modify storage enchantencore:flare shape_3 set value 'burst'

execute store result score $enchantencore_firework_shape_4 enchantencore.technical run random value 1..5
execute if score $enchantencore_firework_shape_4 enchantencore.technical matches 1 run data modify storage enchantencore:flare shape_4 set value 'small_ball'
execute if score $enchantencore_firework_shape_4 enchantencore.technical matches 2 run data modify storage enchantencore:flare shape_4 set value 'large_ball'
execute if score $enchantencore_firework_shape_4 enchantencore.technical matches 3 run data modify storage enchantencore:flare shape_4 set value 'star'
execute if score $enchantencore_firework_shape_4 enchantencore.technical matches 4 run data modify storage enchantencore:flare shape_4 set value 'creeper'
execute if score $enchantencore_firework_shape_4 enchantencore.technical matches 5 run data modify storage enchantencore:flare shape_4 set value 'burst'

execute store result score $enchantencore_firework_shape_5 enchantencore.technical run random value 1..5
execute if score $enchantencore_firework_shape_5 enchantencore.technical matches 1 run data modify storage enchantencore:flare shape_5 set value 'small_ball'
execute if score $enchantencore_firework_shape_5 enchantencore.technical matches 2 run data modify storage enchantencore:flare shape_5 set value 'large_ball'
execute if score $enchantencore_firework_shape_5 enchantencore.technical matches 3 run data modify storage enchantencore:flare shape_5 set value 'star'
execute if score $enchantencore_firework_shape_5 enchantencore.technical matches 4 run data modify storage enchantencore:flare shape_5 set value 'creeper'
execute if score $enchantencore_firework_shape_5 enchantencore.technical matches 5 run data modify storage enchantencore:flare shape_5 set value 'burst'

execute store result score $enchantencore_firework_twinkle enchantencore.technical run random value 1..2
execute if score $enchantencore_firework_twinkle enchantencore.technical matches 1 run data modify storage enchantencore:flare twinkle set value 'true'
execute if score $enchantencore_firework_twinkle enchantencore.technical matches 2 run data modify storage enchantencore:flare twinkle set value 'false'

execute store result score $enchantencore_firework_trail enchantencore.technical run random value 1..2
execute if score $enchantencore_firework_trail enchantencore.technical matches 1 run data modify storage enchantencore:flare trail set value 'true'
execute if score $enchantencore_firework_trail enchantencore.technical matches 2 run data modify storage enchantencore:flare trail set value 'false'

function enchantencore:flare/spawn_rocket_5 with storage enchantencore:flare