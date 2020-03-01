package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/didi/nightingale/src/model"
	"github.com/didi/nightingale/src/modules/collector/config"
	"github.com/didi/nightingale/src/modules/collector/http"
	"github.com/didi/nightingale/src/modules/collector/log/worker"
	"github.com/didi/nightingale/src/modules/collector/sys/cron"
	"github.com/didi/nightingale/src/modules/collector/sys/funcs"
	"github.com/didi/nightingale/src/modules/collector/sys/plugins"
	"github.com/didi/nightingale/src/modules/collector/sys/ports"
	"github.com/didi/nightingale/src/modules/collector/sys/procs"

	"github.com/toolkits/pkg/file"
	"github.com/toolkits/pkg/logger"
	"github.com/toolkits/pkg/runner"
)

const version = 1

var (
	vers *bool
	help *bool
	conf *string
)

func init() {
	vers = flag.Bool("v", false, "display the version.")
	help = flag.Bool("h", false, "print this help.")
	conf = flag.String("f", "", "specify configuration file.")
	flag.Parse()

	if *vers {
		fmt.Println("version:", version)
		os.Exit(0)
	}

	if *help {
		flag.Usage()
		os.Exit(0)
	}
}

func main() {
	aconf()
	pconf()
	start()

	var err error
	config.InitLogger()

	config.Endpoint, err = config.GetEndpoint()
	if err != nil {
		logger.Fatal("cannot get endpoint:", err)
	} else {
		logger.Info("endpoint ->", config.Endpoint)
	}

	if config.Endpoint == "127.0.0.1" {
		log.Fatalln("endpoint: 127.0.0.1, cannot work")
	}

	config.Collect = *model.NewCollect()
	funcs.BuildMappers()
	funcs.Collect()
	cron.GetCollects()

	//插件采集
	plugins.Detect()

	//进程采集
	procs.Detect()

	//端口采集
	ports.Detect()

	//日志采集
	go worker.UpdateConfigsLoop() // step2, step1和step2有顺序依赖
	go worker.PusherStart()
	go worker.Zeroize()

	http.Start()
	ending()
}

// auto detect configuration file
func aconf() {
	if *conf != "" && file.IsExist(*conf) {
		return
	}

	*conf = "etc/collector.local.yml"
	if file.IsExist(*conf) {
		return
	}

	*conf = "etc/collector.yml"
	if file.IsExist(*conf) {
		return
	}

	fmt.Println("no configuration file for collector")
	os.Exit(1)
}

// parse configuration file
func pconf() {
	if err := config.Parse(*conf); err != nil {
		fmt.Println("cannot parse configuration file:", err)
		os.Exit(1)
	}
}

func ending() {
	c := make(chan os.Signal, 1)
	signal.Notify(c, syscall.SIGINT, syscall.SIGTERM, syscall.SIGQUIT)
	select {
	case <-c:
		fmt.Printf("stop signal caught, stopping... pid=%d\n", os.Getpid())
	}

	logger.Close()
	http.Shutdown()
	fmt.Println("sender stopped successfully")
}

func start() {
	runner.Init()
	fmt.Println("collector start, use configuration file:", *conf)
	fmt.Println("runner.Cwd:", runner.Cwd)
	fmt.Println("runner.Endpoint:", runner.Hostname)
}