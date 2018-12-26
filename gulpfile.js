var gulp = require("gulp");
var rename = require('gulp-rename');
var ts = require("gulp-typescript");
var tsProject = ts.createProject("tsconfig.json");
var sourcemaps = require('gulp-sourcemaps');

gulp.task("copy-environment-prod", function () {
    return gulp.src('src/environments/environment.prod.ts')
    	.pipe(rename("environment.ts"))
        .pipe(gulp.dest("src/environments"));
});

gulp.task("copy-environment-dev", function () {
    return gulp.src('src/environments/environment.dev.ts')
    	.pipe(rename("environment.ts"))
        .pipe(gulp.dest("src/environments"));
});