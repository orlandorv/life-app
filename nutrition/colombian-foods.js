/**
 * Colombian dishes and staples, copied from the Instituto Colombiano de
 * Bienestar Familiar's *Tabla de Composición de Alimentos Colombianos* (TCAC),
 * 2018 edition — the country's official food composition table (icbf.gov.co/
 * system/files/tcac_web.pdf). Each row is [name, kcal, protein g, carbohydrate g,
 * fat g, search words, TCAC code], per 100 g of edible portion as the table
 * prints it, and the code says which line of the table it is.
 *
 * Read these as ICBF's numbers, not this app's — don't round or "correct" them:
 * - kcal is ICBF's own (protein×4 + fat×9 + total carbohydrate×4 + fibre×2, FAO 2003),
 *   so it can sit a little above 4·P + 4·C + 9·F where there's fibre.
 * - carbohydrate is *total* carbohydrate (fibre included), as the table gives it.
 * - Cuy asado is the one exception: it uses ICBF's earlier (2017) booklet of 18
 *   traditional preparations, the lab analysis the 2018 table was built from. The
 *   2018 table prints the same protein, fat and ash but a water figure 11 g lower,
 *   which carbohydrate-by-difference turns into 14.8 g of carbs in a roast meat.
 *   That figure is its own typo, not data, so it isn't used.
 * - the dishes (group S) are laboratory analyses of the prepared dish; the table
 *   gives no served-portion weight for any of them, so they're logged in grams.
 * - the app's cooked-rice entry is ICBF's (cooked in oil, 161 kcal), which is
 *   richer than plain boiled rice — that's how it's usually eaten there.
 */

export const COLOMBIAN = {
    'Colombian dishes': [
        ['Ajiaco santafereño', 82, 6.4, 11.3, 0.8, 'chicken potato soup bogota bogotano colombian', 'S001'],
        ['Sancocho valluno de gallina', 121, 16.4, 4.2, 4, 'sancocho chicken soup stew valle del cauca colombian', 'S025'],
        ['Sancocho de bagre', 134, 16.9, 1.6, 6.3, 'sancocho catfish fish soup stew pacifico colombian', 'S024'],
        ['Bandeja paisa', 212, 11.7, 15.3, 11, 'platter frijoles chicharron arroz antioquia paisa colombian', 'S004'],
        ['Arroz atollado', 119, 10.1, 9.2, 4.3, 'rice stew chicken valle del cauca colombian', 'S002'],
        ['Tamal tolimense', 132, 5.7, 16.7, 3.8, 'tamale tamales tolima colombian', 'S032'],
        ['Tamal de maíz (cocido)', 181, 3.8, 23.8, 7.2, 'tamale tamales corn colombian', 'S030'],
        ['Tamal de maíz y guiso (cocido)', 170, 3.5, 17.7, 8.8, 'tamale tamales corn stew colombian', 'S029'],
        ['Mazamorra chiquita', 115, 9.8, 6.1, 5, 'stew beef potato cundiboyacense colombian', 'S019'],
        ['Mute santandereano', 113, 8.1, 5.4, 6.1, 'tripe soup mondongo santander colombian', 'S021'],
        ['Mote de queso', 102, 5.4, 10.2, 3.9, 'yam cheese soup ñame costeño caribe colombian', 'S020'],
        ['Rondón', 136, 8.2, 20.2, 2.1, 'coconut fish stew san andres raizal rundown colombian', 'S023'],
        ['Arroz clavado', 182, 6.4, 26.4, 5.5, 'rice cheese pacifico colombian', 'S003'],
        ['Lechona tolimense', 242, 21.8, 10.2, 12, 'roast pork stuffed rice peas tolima colombian', 'S018'],
        ['Viudo de bocachico', 123, 13.2, 7.8, 4.1, 'fish stew yuca plantain tolima colombian', 'S033'],
        ['Sudao de piangüa', 182, 18.4, 2.7, 10.6, 'piangua clams shellfish pacifico colombian', 'S028'],
        ['Friche de chivo', 243, 29.7, 1.6, 12.9, 'goat meat fried caribe colombian', 'S015'],
        ['Pisillo de chigüiro', 218, 26, 6.9, 9.3, 'capybara dried meat orinoquia llanos colombian', 'S022'],
        ['Cuy asado', 178, 24.4, 2.5, 7.8, 'guinea pig roast nariño colombian', 'S010', 'Source: ICBF, 2017 booklet of 18 traditional preparations'],
        ['Chicharrón de pirarucú', 217, 22, 8.7, 10.3, 'fried fish amazon colombian', 'S007'],
        ['Bollo limpio (precocido)', 178, 3.3, 29.1, 4.8, 'corn bollo costeño colombian', 'S005'],
        ['Carimañola con queso (precocida)', 295, 5.8, 28.6, 17.4, 'cassava yuca fritter cheese colombian', 'S006'],
        ['Empanada de pipián (frita)', 396, 4.7, 34.6, 26.3, 'empanadas potato fried colombian', 'S011'],
        ['Envuelto de maíz mute (precocido)', 163, 3.2, 25.5, 4.8, 'corn envuelto wrapped colombian', 'S012'],
        ['Envuelto de plátano maduro (precocido)', 158, 1.6, 37.6, 0.1, 'plantain envuelto wrapped colombian', 'S013'],
        ['Envuelto de yuca (precocido)', 141, 0.6, 34.3, 0.1, 'cassava envuelto wrapped colombian', 'S014'],
        ['Guacamole', 184, 0.1, 16.3, 12.7, 'avocado dip colombian', 'S016'],
        ['Sopa de arroz', 68, 3.7, 8.4, 2.2, 'rice soup colombian', 'S026'],
        ['Sopa de tortillas', 56, 1.7, 9.3, 1.1, 'tortilla soup colombian', 'S027'],
        ['Chocolate (en agua y leche)', 89, 3.4, 10.3, 3.6, 'hot chocolate drink colombian', 'S009'],
    ],
    'Colombian staples': [
        ['Frijoles cargamanto rojos (cocidos)', 161, 8.1, 26.9, 0.6, 'frijol fríjol frijoles beans red kidney cargamanto colombian', 'T010'],
        ['Lentejas (cocidas)', 122, 7.7, 18.5, 0.5, 'lenteja lentils pulses colombian', 'T025'],
        ['Garbanzos (cocidos)', 187, 8.6, 26, 2.3, 'garbanzo chickpeas pulses colombian', 'T018'],
        ['Arveja seca (cocida)', 138, 8.1, 22.4, 0.4, 'arvejas split peas dried pulses colombian', 'T002'],
        ['Arepa de maíz (asada)', 162, 4.1, 36.3, 0, 'arepas corn cake grilled colombian', 'A006'],
        ['Arepa de maíz con queso (asada)', 211, 4.8, 29, 8.4, 'arepas corn cake cheese grilled colombian', 'A007'],
        ['Arepa de maíz (frita)', 325, 3.4, 32.1, 20.3, 'arepas corn cake fried colombian', 'A008'],
        ['Arepa de maíz precocida (sin sal)', 156, 3.4, 34.5, 0.5, 'arepas corn cake precooked colombian', 'A005'],
        ['Arroz blanco (cocido)', 161, 2.3, 32.5, 2.1, 'rice cooked white colombian', 'A009'],
        ['Pan de queso', 367, 10.4, 33.5, 20.8, 'cheese bread colombian', 'A065'],
        ['Pan de yuca', 355, 15.8, 45.5, 12.2, 'cassava bread colombian', 'A067'],
        ['Pandebono', 357, 15.8, 50.7, 10.1, 'cheese bread cornmeal colombian', 'A070'],
        ['Pan francés', 308, 10.1, 61.1, 2.1, 'french bread roll bread colombian', 'A068'],
        ['Yuca (cocida)', 157, 0.7, 36.6, 0.2, 'cassava manioc boiled colombian', 'B106'],
        ['Yuca dorada', 231, 0.9, 43.6, 5.1, 'cassava manioc browned colombian', 'B108'],
        ['Plátano maduro frito (tajadas)', 312, 1.2, 52.6, 10.2, 'plantain tajadas fried sweet colombian', 'B090'],
        ['Patacón (plátano verde frito)', 353, 1.6, 41.8, 19.2, 'plantain tostones fried green colombian', 'B093'],
        ['Plátano verde (cocido)', 133, 0.9, 30.6, 0.3, 'plantain green boiled colombian', 'B091'],
        ['Plátano maduro (cocido)', 130, 0.8, 30.1, 0.2, 'plantain ripe boiled sweet colombian', 'B088'],
        ['Papa criolla (cocida)', 85, 1.4, 18.1, 0, 'potato yellow potatoes boiled colombian', 'B070'],
        ['Ñame (cocido)', 125, 1.5, 27.6, 0.1, 'yam boiled colombian', 'P073'],
        ['Ahuyama (cocida)', 48, 0.7, 8.4, 0.7, 'pumpkin squash cooked colombian', 'B005'],
        ['Aguacate Hass', 221, 1.3, 13.5, 16.4, 'avocado fruit colombian', 'C001'],
        ['Queso costeño', 303, 17.5, 0.9, 25.5, 'cheese costeno salty fresh colombian', 'G018'],
        ['Queso campesino', 301, 17.5, 0.3, 25.5, 'cheese fresh farmer colombian', 'G017'],
        ['Cuajada', 207, 15.2, 2, 15.4, 'cheese curd fresh colombian', 'G016'],
        ['Queso doble crema', 286, 23.4, 5.9, 18.7, 'cheese double cream colombian', 'G021'],
        ['Suero costeño (queso blando)', 83, 11, 6.4, 1.5, 'cheese soft fresh whey colombian', 'G015'],
        ['Huevo cocido', 145, 13, 0, 10.4, 'eggs boiled hard colombian', 'J003'],
        ['Huevo frito', 208, 17.1, 2, 14.6, 'eggs fried colombian', 'J006'],
        ['Huevo revuelto', 152, 10.2, 2.3, 11.4, 'eggs scrambled pericos colombian', 'J007'],
        ['Pechuga de pollo (cocida)', 141, 28.4, 0.3, 3, 'chicken breast poultry cooked pollo colombian', 'F087'],
        ['Lomo de res (cocido)', 218, 36.1, 0.5, 7.9, 'beef sirloin loin cooked carne colombian', 'F114'],
        ['Churrasco de res (asado)', 175, 33.2, 0.4, 4.5, 'beef steak grilled carne colombian', 'F104'],
        ['Sobrebarriga (cocida)', 331, 24.2, 0, 26, 'beef flank cooked carne colombian', 'F123'],
        ['Callo o menudo de res (cocido)', 102, 15, 1.1, 4.1, 'tripe beef cooked mondongo colombian', 'F096'],
        ['Lomo de cerdo (cocido)', 170, 35.1, 0, 3.2, 'pork loin cooked colombian', 'F018'],
        ['Costilla de cerdo (cocida)', 258, 29.5, 0, 15.6, 'pork ribs cooked colombian', 'F014'],
        ['Chicharrón (tocino frito)', 599, 20.8, 2.8, 56.1, 'pork rinds belly fried colombian', 'F030'],
        ['Chorizo de cerdo y res (crudo)', 321, 24.1, 4, 23.1, 'sausage pork beef raw colombian', 'F034'],
        ['Arequipe', 320, 6.4, 56.7, 7.5, 'dulce de leche caramel colombian', 'K001'],
        ['Arroz con leche', 89, 3.3, 15.5, 1.5, 'rice pudding colombian', 'K002'],
        ['Bocadillo de guayaba', 332, 0.4, 79.6, 0.5, 'guava paste sweet colombian', 'K005'],
        ['Panela', 364, 0.6, 90.2, 0.1, 'cane sugar unrefined colombian', 'K033'],
    ],
};
